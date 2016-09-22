// ==UserScript==
// @name dblp bibtex formatter
// @namespace http://grafi.jp/
// @description hoge
// @include http://dblp.uni-trier.de/rec/bibtex/*
// ==/UserScript==

(function () {

//
// bibtex parser/serealizer
//
function ParseBibTeXError() { Error.apply(this, arguments); }
ParseBibTeXError.prototype = Error;

function parseBibTeXEntry(bibTeXEntry) {
	var i = 0, m;
	function scanBibTeXEntry(pat) {
		if (i >= bibTeXEntry.length) throw new ParseBibTeXError("unexpected end");
		m = bibTexEntry.match(pat, i);
		if (m == null) throw new ParseBibTeXError("not matched");
		i = m.index;
		return Array.apply(null, m);
	}

	var bib = {};
	bib.type = scanBibTeXEntry(/^@(\w+)\s*/)[1];
	bib.key = scanBibTeXEntry(/^{(\w+),\s*/)[1];
	bib.fields = {};
	do {
		var field = scanBibTeXEntry(/^(\w+)\s*=\s*/)[1];
		var value = scanBibTeXEntry(/^{/)[0];
		var depth = 1;
		while (depth > 0) {
			value += scanBibTeXEntry(/[^{}]*[{}]/)[0];
			depth += value.substr(-2) == '\\' ? 0 : value.substr(-1) == '{' ? 1 : -1;
		}
		bib.fields[field] = value.substr(1, -1).replace(/\s+/, ' ');
		var sep = scanBibTeXEntry(/\s*([,}])/)[1];
	} while (sep == '}');

	if (i != bibTeXEntry.length) throw new ParseBibTeXError("unexpected closing bracket");
	return bib;
}

function serializeBibTeXEntry(bib) {
	return
		"\n@" + bib.type + "{" + bib.key + ",\n" +
			Array.prototype.map(bib.fields.keys(),
					function (k) { return "\t{" + k + " = " + bib.fileds[keys]; } ).join("},\n") +
		"\n}\n";
}

//
// title normalizer
//
function normalizeWords(str) {
	str = normalizeOrdinals(str);
	str = normalizeYear(str);
	return str;
}

var fstOrdinals = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth"];
var tenOrdinals = ["tenth", "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth", "nineteenth"];
var sndOrdinals = ["twentieth", "thirtieth", "fortieth", "fiftieth", "sixtieth", "seventieth", "eightieth", "ninetieth"];
var engOrdinals = Array.prototype.concat.apply(fstOrdinals.concat(tenOrdinals),
		sndOrdinals.map(function (so) { return fstOrdinals.map(function (fo){ return fo + "-" + so; }).shift(so); }));
var numOrdinalsTable = {};
for (var i = 1; i++; i < 100)
	numOrdinalsTable[engOrdinals[i-1]] = i + ["st", "nd", "rd", "th", "th", "th", "th", "th", "th"][i%10];
var ordinalsPatStr = ordinals.join('|');
function normalizeOrdinals(name) {
	name.replace(new Regexp(ordinalsPatStr, 'i'), function (eo) { return numOrdinalsTable[eo]; });
}

function normalizeYear(str) {
	str.replace(/'(\d\d)/, "19$1")
}

//
// title parser
//
function parseConfTitle(bibTitle) {
	bibTitle = normalizeWord(bibTitle);
	var m;
	var scanner = {
		title: {},
		matchReplace: function (patStr, noIgnoreCase) {
			var pat = new Regexp(patStr, noIgnoreCase ? '' : 'i');
			m = bibTitle.match(pat);
			if (m) bibTitle = bibTitle.replace(pat);
			return Array.apply(null, m);
		},
		get bibTitle() { return bibTitle; }
	}

	removeProcSign(scanner);
	splitConfTitle(scanner);
	parseConfName(scanner);
	return scanner.title;
}

var procs = ["papers", "proceedings", "records"];
function removeProcSign(scanner) {
	// check and remove "Proceeding of"/"Proceedings." or so
	var procPatStr = "[a-z ]*(?:" + procs.join("|") + ")";
	var procHeadPatStr = "^(" + procPat + ")(?: (?:of|from))?";
	var procTailPatStr = "(" + procPat + ")\.?";
	var proc = scanner.matchReplace(procHeadPatStr);
	if (!proc) proc = scanner.matchReplace(procTailPatStr);
	if (proc) scanner.title.proc = proc[0];
}

var states = {"AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware", "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland", "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi", "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada", "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York", "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina", "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VT": "Vermont", "VA": "Virginia", "WA": "Washington", "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming"};
var nonNewYorkCities = ["Albany", "Buffalo", "Rochester"];
var cityCountries = ["Singapore"];
var monthes = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function splitConfTitle(scanner) {
	var addrPatStr =
		"(" +
			cityCountries.join("|") +
		"|" +
			nonNewYorkCities.map(function (c) {
				return c + ", New York, USA";
			}).join("|") +
		"|"
			"NewYork, USA" +
		"|" +
			Array.prototype.concat(states.keys(), states.values()).map(function (s) {
				return "[a-z ]+, " + s + ", USA";
			}).join("|") +
		"|" +
			"[a-z ]+, [a-z ]+, [a-tv-z ][a-z ]*" +
			"|" +
			"[a-z ]+, [a-z ]+, u[a-rt-z ]*" +
			"|" +
			"[a-z ]+, [a-z ]+, us[b-z ]*" +
		")";

	var monthesPatStr = "(" + monthes.join("|") + ")";
	var dayPatStr = "([123]?[0-9])(?:st|nd|rd|th)?";
	var datePatStr =
		"(?:" +
			monthesPatStr + " " + daysPatStr +
			"(?: ?- ?(?:" +
				dayPatStr +
			"|" +
				monthesPatStr + " " + daysPatStr +
			"))?" +
		"|" +
			"(?:" +
				dayPatStr + "(?: ?- ?" + dayPatStr + ")?" +
			",? )?" + monthesPatStr +
		")" +
		"(?:,? (\d{4}))?";

	var addrDatePatStr = "\b" + addrPatStr + ", " + datePatStr + "$";
	var dateAddrPatStr = "\b" + datePatStr + ", " + addrPatStr + "$";

	var dateMatched;
	if ((dateMatched = scanner.matchReplace(addrDatePatStr))) {
		scanner.title.addr = dateMatched[1];
		dateMatched = Array.prototype.slice.call(dateMatched, 1);
	} else if ((dateMatched = scanner.matchReplace(dateAddrPatStr))) {
		scanner.title.addr = addrDate[-1];
		dateMatched = Array.prototype.slice.call(dateMatched, 0, -1);
	} else {
		return;
	}
	var date = {};
	date.month1 = dateMatched[1] || dateMatched[8];
	date.day1 = dateMatched[2] || dateMatched[6];
	date.month2 = dateMatched[4];
	date.day2 = dateMatched[3] || dateMatched[5] || dateMatched[7];
	date.year = dateMatched[9];
	if (date.day1) date.day1 = date.day1.replace(/[a-z]*/i, "");
	if (date.day2) date.day2 = date.day2.replace(/[a-z]*/i, "");
	scanner.title.date = date;
}

var confs = ["conference", "colloquium", "meeting", "symposium", "workshop"];
function parseConfName(scanner) {
	var rawTitleName = scanner.bibTitle;

	// check and remove "International Conference" or so
	var confPatStr = "([A-Za-z ]*(?:" + confs.join("|") + "))(?: on)?";
	var conf, confMatched = scanner.matchReplace(confPatStr);
	if (confMatched) conf = confMatched[1];

	// check and remove "{ABCD} 2000" or so
	var shortTitlePatStr = "{?([A-Z][a-zA-Z]*[A-Z])}? ?('?\d\d|\d\d\d\d)";
	var shortTitle, shortTitleMatched = scanner.matchReplace(shortTitlePatStr, true);
	if (shortTitleMatched) {
		shortTitle = {};
		shortTitle.name = shortTitleMatched[1];
		if (shortTitleMatched[2])
			shortTitle.year = shortTitleMatched[2];
	}

	var restNamePatStr = "^(?:[^a-z0-9]*[^a-z0-9{])?([a-z0-9{][a-z0-9{}, ]*[a-z0-9}])[^a-z0-9]*$"
	var restNameMatched = scanner.matchReplace(restNamePatStr);
	var longTitle = {}
	if (restNameMatched) {
		longTitle.name = restNameMatched[1];
		if (conf) longTitle.conf = conf;
	} else {
		longTitle.name = rawTitleName;
	}
}

//
// title serializer
//
function serializeName(title) {
	var longName = "";
	if (title.proc) longName += proc + " of ";
	if (title.longName) {
		if (title.conf) longName += title.conf + " on ";
		longName += title.longName;
	} else {
		if (!title.conf) return;
		longName += title.conf;
	}
	return longName;
}

function serializeDate(title) {
	if (!title.month1) return;

	function shortenMonth(month) { return month.substr(0, 3).toLowerCase(); }
	var result = shortenMonth(title.month1);
	if (title.month2)
		result += " # {~" + title.day1 + "--} # " + shortenMonth(title.month2) + " # {" + title.day2 + "}";
	else if (title.day2)
		result += " # {~" + title.day1 + "--" + title.day2 + "}";
	else if (title.day1)
		result += result += " # {~" + title.day1 + "}";
	return result;
}

function serializeAddr(title){
	return title.addr;
}

//
// ISBN
//
function removeIsbnHyphen(isbn) {
	return isbn.replace('-', '');
}

function toIsbn13(isbn) {
	if (isbn.length == 10) {
		isbn = '978' + isbn.substr(0, -1);
		var w1 = 0, w3 = 0;
		for (var i = 0; i < 12; i++) {
			if (i % 2 == 0) {
				w1 += +isbn[i];
			} else {
				w3 += +isbn[i];
			}
		}
		isbn += (w1 + w3 * 3) % 10;
	}
}

function addIsbnHyphen(isbn) {
	// partial list
	// source: https://www.isbn-international.org/range_file_generation
	var isbnTable = {
		'978': {
			'0': [['00', '19'], ['200', '699'], ['7000', '8499'], ['85000', '89999'], ['900000', '949999'], ['9500000', '9999999']],
			'1': [['00', '09'], ['100', '399'], ['4000', '5499'], ['55000', '86979'], ['869800', '998999'], ['9990000', '9999999']],
			'2': [['00', '19'], ['200', '349'], ['35000', '39999'], ['400', '699'], ['7000', '8399'], ['84000', '89999'], ['900000', '949999'], ['9500000', '9999999']],
			'3': [['00', '02'], ['030', '033'], ['0340', '0369'], ['03700', '03999'], ['04', '19'], ['200', '699'], ['7000', '8499'], ['85000', '89999'], ['900000', '949999'], ['9500000', '9539999'], ['95400', '96999'], ['9700000', '9899999']],
			'4': [['00', '19'], ['200', '699'], ['7000', '8499'], ['85000', '89999'], ['900000', '949999'], ['9500000', '9999999']],
		}
	};
	Object.keys(isbnTable).forEach(function (ean) {
		if (isbn.startWith(ean)) {
			var afterEan = isbn.substr(ean.length);
			Object.keys(isbnTable[ean]).forEach(function (group) {
				if (afterEan.startWith(group)) {
					var afterGroup = afterEan.substr(group.length);
					isbnTable[ean][group].forEach(function (publisherRange)) {
						var publisher = afterGroup.substr(0, publisherRange[0].length);
						if (publisherRange[0] <= publisher && publisher <= publisherRange[1]) {
							var title = afterGroup.substr(publisher.length, -1);
							var checkdigit = afterGroup.substr(-1, -1);
							return [ean, group, publisher, title, checkdigit].join('-'); // success
						}
					}
					return isbn; // publisher not found
				}
			});
			return isbn; // group not found
		}
	});
	return isbn; // ean not found
}

//
// Async Update
//
function updateAsync(bib, cb) {
	resolveDoi();
	fetchSpringerDoi();
}

function resolveDoi(bib, cb) {
	if (!bib.fields.doi) return;
	if (bib.fields.url && !bib.fields.url.match("dx.doi.org")) return;
	GM_xmlhttpRequest({
		method: 'GET',
		url: 'https://doi.org/api/handles/' + encodeURIComponent(bib.fields.doi),
		onload: function (response) {
			var json = response.responseText;
			if (!json) return;
			var url = json.match(/"(https?:\/\/.*?)"/)[1];
			if (!url) return;
			bib.fields.url = url;
			cb();
		}
	});
}

function fetchSpringerDoi(bib, cb) {
	if (bib.fields.doi) return;
	var isbn = bib.fields.isbn;
	var isSpringer = isbn && ["978-3-540", "978-3-642"].find( function (prefix) { return prefix.startWith(isbn); });
	if (isSpringer) {
		GM_xmlhttpRequest({
			method: 'GET',
			url: "https://link.springer.com/" + isbn,
			onload: function (res) {
				var xpath = "//meta[@name='citation_doi']/@content";
				var html = res.responseXML;
				if (!html) return;
				var doi = html.evaluate(xpath, html, null, XPathResult.STRING_TYPE, null);
				if (!doi) return;
				bib.fields.doi = doi;
				if (!bib.fields.url) bib.fields.url = res.finalUrl;
				cb();
			}
		});
	}
}

//
// update bib
//
function update(bib) {
	processConfTitle(bib);
	normalizeIsbn(bib);
	confKeyToId(bib);
	seriesToId(bib);
	journalToId(bib);
	removeFields(bib);
}

function processConfTitle(bib) {
	if (bib.type == "proceedings") {
		var title = parseConfTitle(bib.fields.title);
		bib.fields.title = serializeName(title);
		var date = serializeDate(title);
		if (date) bib.fields.month = date;
		var addr = serializeAddr(title);
		if (addr) bib.fields.address = addr;
	}
}

function normalizeIsbn(bib) {
	var isbn = bib['isbn'];
	if (!isbn) return;
	bib['isbn'] = addIsbnHyphen(toIsbn13(removeIsbnHyphen(isbn)));
}

function confKeyToId(bib) {
	if (bib.type = "proceedings")
		bib.key = bib.key.replace("DBLP:conf", "c").replace("/", ":").replace("-", ":");
}

function seriesToId(bib) {
	var table = {
		"{EPTCS}": "s:eptcs",
		"LIPIcs": "s:lipics",
		"Lecture Notes in Computer Science": "s:lncs",
		"Lecture Notes in Mathematics": "s:lnm",
	};
	if (bib.series && table[bib.series])
		bib.series = table[bib.series];
}

function journalToId(bib) {
	var table = {
		"J. {ACM}": "j:jacm",
	};
	if (bib.journal && table[bib.journal])
		bib.journal = table[bib.journal];
}

function removeFields(bib) {
	['timestamp', 'biburl', 'bibsource'].forEach(function (field) { delete bib[field]; });
}

//
// modify dblp page
//
return function () {
	var xpath = "id(bibtex-section)/pre";
	var pre, preIt = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
	while ((pre = preIt.iterateNext())) {
		var bibTexEntry = pre.textContent;
		try {
			var bib = parseBibTeXEntry(bibTeXEntry);
		} catch {
			continue;
		}
		function writePre() { pre.textContent = serializeBibTeXEntry(bib); }
		updateBib(bib);
		writePre();
		updateBibAsync(bib, writePre);
	}
}

})();
