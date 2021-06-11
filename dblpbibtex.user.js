// ==UserScript==
// @name        dblp bibtex formatter
// @namespace   http://grafi.jp/
// @description hoge
// @include     /^https?://dblp2?\.uni-trier\.de/rec/.*\?view=bibtex$/
// @version     1
// @grant       GM.xmlHttpRequest
// ==/UserScript==

(function () {
"use strict";

//
// bibtex parser/serealizer
//
function parseBibTeXEntry(bibTeXEntry) {
	var i = 0, m;
	function scanBibTeXEntry(patStr) {
		if (i >= bibTeXEntry.length) throw new Error("unexpected end");
		var re = new RegExp(patStr, 'y');
		re.lastIndex = i;
		m = re.exec(bibTeXEntry);
		if (m == null) throw new Error("not matched: " + patStr);
		i = re.lastIndex;
		return Array.apply(null, m);
	}

	var bib = {};
	bib.type = scanBibTeXEntry("@([a-z]+)\\s*")[1];
	bib.key = scanBibTeXEntry("{(\\S+?),\\s*")[1];
	bib.fields = {};
	bib.openFields = {};
	do {
		var field = scanBibTeXEntry("([a-zA-Z]+)\\s*=\\s*")[1];
		var value = scanBibTeXEntry("{")[0];
		var depth = 1;
		while (depth > 0) {
			value += scanBibTeXEntry("[^{}]*[{}]")[0];
			depth += value.slice(-2, -1) == '\\' ? 0 : value.slice(-1) == '{' ? 1 : -1;
		}
		bib.fields[field] = value.slice(1, -1).replace(/\s+/g, ' ');
		var sep = scanBibTeXEntry("\\s*([,}])\\s*")[1];
	} while (sep == ',');

	if (i != bibTeXEntry.length) throw new Error("unexpected closing bracket");
	return bib;
}

function serializeBibTeXEntry(bib) {
	function enbrace(k, v) { return bib.openFields[k] ? v : "{" + v + "}"; }
	var result = bib.type == "string" ?
		"@" + bib.type + "{" + bib.key + " = " + enbrace(bib.key, bib.value) + "}\n" :
		"@" + bib.type + "{" + bib.key + ",\n" +
			Object.keys(bib.fields).map(
					function (k) { return "\t" + k + " = " + enbrace(k, bib.fields[k]); } ).join(",\n") +
		"\n}\n";
	return result;
}

//
// title normalizer
//
var fstOrdinals = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth"];
var tenOrdinals = ["tenth", "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth", "nineteenth"];
var sndNumbers = ["twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
var engOrdinals = Array.prototype.concat.apply(fstOrdinals.concat(tenOrdinals),
		sndNumbers.map(function (sn) {
			return [sn.substr(0, -2) + "ieth"].concat(
				fstOrdinals.map(function (fo){ return sn + "-" + fo; }));
		}));
var numOrdinalsTable = {};
for (var i = 1; i < 100; i++)
	numOrdinalsTable[engOrdinals[i-1]] = i + ["st", "nd", "rd", "th", "th", "th", "th", "th", "th"][(i-1)%10];
var ordinalsPatStr = engOrdinals.join('|');
function normalizeOrdinals(name) {
	return name.replace(new RegExp(ordinalsPatStr, 'ig'),
		function (eo) { return numOrdinalsTable[eo.toLowerCase()]; });
}

//
// title parser
//
var wordsPatStr = "(?:[a-z{}'.]|\\\\.)+";
wordsPatStr = "(?:" + wordsPatStr + "(?:-" + wordsPatStr + ")*)";
wordsPatStr = "(?:" + wordsPatStr + "(?: " + wordsPatStr + ")*)";
function parseConfTitle(bibTitle) {
	bibTitle = normalizeOrdinals(bibTitle);
	var m;
	var scanner = {
		title: {},
		matchReplace: function (patStr) {
			var pat = new RegExp(patStr, 'i');
			m = bibTitle.match(pat);
			if (m) {
				bibTitle = bibTitle.replace(pat, "");
				return Array.apply(null, m);
			}
		},
		get bibTitle() { return bibTitle; }
	}

	removePart(scanner);
	removeProcSign(scanner);
	splitConfTitle(scanner);
	parseConfName(scanner);
	return scanner.title;
}

function removePart(scanner) {
	var partPatStr = ", (Part {I+})$";
	var partMatched = scanner.matchReplace(partPatStr);
	if (partMatched) scanner.title.part = partMatched[1];
}

var procs = ["papers", "proceedings", "record", "records"];
function removeProcSign(scanner) {
	// check and remove "Proceeding of"/"Proceedings." or so
	var procPatStr = "[a-z ]*(?:" + procs.join("|") + ")";
	var procHeadPatStr = "^(" + procPatStr + ")(?: (?:of|from)(?: the)?)?";
	var procTailPatStr = "[,.] (" + procPatStr + ")\.?$";
	var procMatched = scanner.matchReplace(procHeadPatStr);
	if (!procMatched) procMatched = scanner.matchReplace(procTailPatStr);
	if (procMatched) scanner.title.proc = procMatched[1];
}

var states = {"AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware", "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland", "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi", "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada", "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York", "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina", "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VT": "Vermont", "VA": "Virginia", "WA": "Washington", "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming"};
var nonNewYorkCities = ["Albany", "Buffalo", "Rochester"];
var cityCountries = ["Luxembourg", "Monaco", "Singapore"];
var monthes = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function splitConfTitle(scanner) {
	var cityCountriesPatStr = "(" +
		cityCountries.map(function (c) { return c + "|" + c + ", " + c; }).join("|") +
	")";
	var usaPatStr = "((?:" +
		["New York", "New York City"]
		.concat(nonNewYorkCities.map(function (c) { return c + ", New York"; }))
		.concat(
			Object.keys(states)
			.concat(Object.values(states).filter(function (s) { return s != "New York"; }))
			.map(function (s) { return wordsPatStr + ", " + s; })
		)
		.join("|") +
	"), (?:USA|{USA}))";
	var otherPatStr = "(" + wordsPatStr + ", " + wordsPatStr + ")";

	var monthesPatStr = "(" + monthes.join("|") + ")";
	var daysPatStr = "([123]?[0-9])(?:st|nd|rd|th)?";
	var datePatStr =
		"(?:" +
			monthesPatStr + " " + daysPatStr +
			"(?: ?- ?(?:" +
				daysPatStr +
			"|" +
				monthesPatStr + " " + daysPatStr +
			"))?" +
		"|" +
			"(?:" +
				daysPatStr + "(?: ?- ?" + daysPatStr + ")?" +
			",? )?" + monthesPatStr +
		")" +
		"(?:,? ([0-9]{4}))?";

	var dateMatched, addr, date = {};
	[cityCountriesPatStr, usaPatStr, otherPatStr].some(function (addrPatStr) {
		var addrDatePatStr = ", " + addrPatStr + ", " + datePatStr + "$";
		var dateAddrPatStr = ", " + datePatStr + ", " + addrPatStr + "$";
		if ((dateMatched = scanner.matchReplace(addrDatePatStr))) {
			addr = dateMatched[1];
			dateMatched = Array.prototype.slice.call(dateMatched, 1);
		} else if ((dateMatched = scanner.matchReplace(dateAddrPatStr))) {
			addr = dateMatched.pop();
		} else {
			return false;
		}

		// quirk
		if (addrPatStr == cityCountriesPatStr) {
			if (addr.search(",") == -1)
				addr = addr + ", " + addr;
		}
		if (addrPatStr == usaPatStr) {
			var addrUsaAry = addr.split(", ");
			if (!addrUsaAry[2]) {
				addrUsaAry[0] = "New York City";
				addrUsaAry[1] = "NY";
			}
			if (states[addrUsaAry[1]]) addrUsaAry[1] = states[addrUsaAry[1]];
			addrUsaAry[2] = "USA";
			addr = addrUsaAry.join(", ");
		}

		return true;
	});
	if (!dateMatched) return;

	date.month1 = dateMatched[1] || dateMatched[8];
	date.day1 = dateMatched[2] || dateMatched[6];
	date.month2 = dateMatched[4];
	date.day2 = dateMatched[3] || dateMatched[5] || dateMatched[7];
	date.year = dateMatched[9];
	if (date.day1) date.day1 = date.day1.replace(/[a-z]*/i, "");
	if (date.day2) date.day2 = date.day2.replace(/[a-z]*/i, "");

	if (addr) scanner.title.addr = addr;
	scanner.title.date = date;
}

var helds = ["co-located with", "held as part of"];
var confs = ["conference", "colloquium", "meeting", "symposium", "workshop"];
function parseConfName(scanner) {
	var title = scanner.title;

	var hostPatStr = ",? (" + helds.join("|") + ") (.*)$";
	var confPatStr = "((?:[0-9a-z'{}]+(?:-[0-9a-z'{}]+)* )*(?:" + confs.join("|") + "))(?: on)?\\b";
	var abbrPatStr = "(?:^|[^a-z0-9'{}]) ?({?[a-z]+(?:-[a-z]+)*}? ?(?:'?[0-9]{2}|[0-9]{4})) ?(?:$|[^a-z0-9'{}])";
	var restPatStr = "^[^a-z0-9'{}]*([a-z0-9'{}]+(?:,? [a-z0-9'{}]+)*)[^a-z0-9'{}]*$";
	function fixAbbr(abbr) {
		var abbrName = abbr.match(/[a-z]+(?:-[a-z]+)*/i)[0];
		var abbrYear = abbr.match(/[0-9]+/i)[0];
		if (abbrYear.length == 2)
			abbrYear = (abbrYear >= "30" ? "19" : "20") + abbrYear;
		return "{" + abbrName + "} " + abbrYear;
	}

	var hostMatched = scanner.matchReplace(hostPatStr);
	if (hostMatched) {
		var hostAbbrMatched = hostMatched[2].match(new RegExp(abbrPatStr, 'i'));
		if (hostAbbrMatched)
			hostMatched[2] = fixAbbr(hostAbbrMatched[1]);
		title.held = hostMatched[1];
		title.host = hostMatched[2];
	}

	var rawTitleName = scanner.bibTitle;
	// check and remove "International Conference" or so
	var confMatched = scanner.matchReplace(confPatStr);
	// check and remove ": {ABCD} 2000 -" or so
	var abbrMatched = scanner.matchReplace(abbrPatStr);
	// check whether remained words are not separated by " - ", ":" or so
	var restMatched = scanner.matchReplace(restPatStr);

	if (restMatched) {
		title.name = restMatched[1];
		if (confMatched)
			title.conf = confMatched[1];
		if (abbrMatched)
			title.abbr = fixAbbr(abbrMatched[1]);
	} else {
		title.name = rawTitleName;
	}
}

//
// title serializer
//
function serializeHeadTail(title) {
	var head = "";
	if (title.conf) head += title.conf + " on ";
	head += title.name;
	if (title.abbr) head += ", " + title.abbr;
	if (title.held) head += ", " + title.held + " " + title.host;

	var tail = "";
	if (title.proc) tail += ", " + title.proc;
	if (title.part) tail += ", " + title.part;
	tail = tail.replace(/^, /, "");

	return { head: head, tail: tail };
}

function serializeName(title) {
	var {head, tail} = serializeHeadTail(title);
	return tail ? head + ", " + tail : head;
}

function serializeDate(title, withYear) {
	if (!title.date) return;
	var date = title.date;

	function shortenMonth(month) { return month.slice(0, 3).toLowerCase(); }
	function year() { return withYear && date.year ? ", " + date.year : ""; }
	var result = shortenMonth(date.month1);
	if (date.month2)
		result += " # {~" + date.day1 + "--} # " + shortenMonth(date.month2) + " # {~" + date.day2 + year() + "}";
	else if (date.day2)
		result += " # {~" + date.day1 + "--" + date.day2 + year() + "}";
	else if (date.day1)
		result += " # {~" + date.day1 + year() + "}";
	return result;
}

function serializeAddr(title) {
	return title.addr;
}

//
// ISBN
//
function removeIsbnHyphen(isbn) {
	return isbn.replace(/-/g, '');
}

function toIsbn13(isbn) {
	if (isbn.length == 10) {
		isbn = '978' + isbn.slice(0, -1);
		var w1 = 0, w3 = 0;
		for (var i = 0; i < 12; i++) {
			if (i % 2 == 0) {
				w1 += +isbn[i];
			} else {
				w3 += +isbn[i];
			}
		}
		var checkDigit = -(w1 + w3 * 3) % 10;
		if (checkDigit < 0) checkDigit += 10;
		isbn += checkDigit;
	}
	return isbn;
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

	function searchEan() {
		Object.keys(isbnTable).some(function (ean) {
			if (isbn.startsWith(ean))
				return searchGroup(ean);
		});
	}
	function searchGroup(ean) {
		Object.keys(isbnTable[ean]).some(function (group) {
			if (isbn.startsWith(group, ean.length))
				return searchPublisher(ean, group);
		});
	}
	function searchPublisher(ean, group) {
		isbnTable[ean][group].some(function (publisherRange) {
			var publisher = isbn.substr((ean + group).length, publisherRange[0].length);
			if (publisherRange[0] <= publisher && publisher <= publisherRange[1])
				return updateIsbn(ean, group, publisher);
		});
	}
	function updateIsbn(ean, group, publisher) {
		var title = isbn.slice((ean + group + publisher).length, -1);
		var checkDigit = isbn.slice(-1);
		isbn = [ean, group, publisher, title, checkDigit].join("-");
		return true;
	}

	searchEan();
	return isbn;
}

//
// update bib
//
function updateBib(bib) {
	confKeyToIdWithTitle(bib);
	journalKeyToId(bib);
	articleId(bib);
	normalizeIsbn(bib);
	fixInterval(bib);
	publisherToId(bib);
	seriesToId(bib);
	var abbrBib = processConfTitle(bib);
	removeFields(bib);
	return abbrBib;
}

function confKeyToIdWithTitle(bib) {
	function conv(key) {
		return key.replace("DBLP:conf", "c").replace(/\//g, ":").replace(/:[a-zA-Z][^:]*$/, "").replace(/-/g, ":");
	}
	if (bib.type == "proceedings") {
		bib.confTitle = parseConfTitle(bib.fields.title);
		bib.key = conv(bib.key);
	} else if (bib.type == "inproceedings") {
		if (bib.fields.crossref) {
			bib.fields.crossref = conv(bib.fields.crossref);
		} else {
			bib.confTitle  = parseConfTitle(bib.fields.booktitle);
			bib.key2 = conv(bib.key);
			var year = bib.confTitle.date && bib.confTitle.date.year || bib.fields.year;
			if (year) bib.key2 += ":" + year;
			var partNum = bib.confTitle.part && bib.confTitle.part.match(/Part {(I+)}/)[1].length;
			if (partNum) bib.key2 += ":" + partNum;
		}
	}
}

function journalKeyToId(bib) {
	if (bib.type == "article" && bib.fields.journal) {
		var journalMatched = bib.key.match(/^DBLP:journals\/([a-z]+)\//);
		if (journalMatched) {
			bib.fields.journal = "j:" + journalMatched[1];
			bib.openFields.journal = true;
		}
	}
}

function articleId(bib) {
	if (bib.type != "proceedings") {
		var lastNames = bib.fields.author.split(" and ").map(function (n) {
			return n.split(" ").pop().replace(/[^-a-z]/gi, "");
		});
		var titleWords = bib.fields.title.split(" ").map(function (w) {
			return w.replace(/[^-a-z]/gi, "");
		});
		bib.key =
			lastNames[0] + lastNames.slice(1).map(function (l) { return l.charAt(); }).join("") +
			(bib.fields.year ? bib.fields.year.slice(-2) : "") +
			titleWords.slice(0, 3).map(function (w) { return w.toLowerCase().charAt(); }).join("");
	}
}

function fixInterval(bib) {
	function conv(str) { return str.replace(/(\d)+-(\d+)/, "$1--$2"); }
	if (bib.fields.number) bib.fields.number = conv(bib.fields.number);
	if (bib.fields.pages) bib.fields.pages = conv(bib.fields.pages);
}

var publisherTable = {
	"Schloss Dagstuhl - Leibniz-Zentrum fuer Informatik": "p:dagstuhl",
	"Elsevier": "p:elsevier",
	"{IEEE} Computer Society": "p:ieeecomp",
	"{SIAM}": "p:siam",
	"Springer": "p:springer",
	"{ACM}": "p:acm",
}
var seriesTable = {
	"{EPTCS}": "s:eptcs",
	"{LIPIcs}": "s:lipics",
	"Lecture Notes in Computer Science": "s:lncs",
	"Lecture Notes in Mathematics": "s:lnm",
	"{JMLR} Workshop and Conference Proceedings": "s:jmlr",
}
function lookupFunction(field, table) {
	return function (bib) {
		if (bib.fields[field] && table[bib.fields[field]]) {
			bib.fields[field] = table[bib.fields[field]];
			bib.openFields[field] = true;
		}
	}
}
var publisherToId = lookupFunction("publisher", publisherTable);
var seriesToId = lookupFunction("series", seriesTable);

function processConfTitle(bib) {
	var title = bib.confTitle;

	if (bib.type == "proceedings") {
		bib.fields.title = serializeName(title);
		bib.fields.booktitle = bib.fields.title;

		var date = serializeDate(title);
		if (date) {
			bib.fields.month = date;
			bib.openFields.month = true;
		}
		var addr = serializeAddr(title);
		if (addr) bib.fields.address = addr;

		var abbrBib = {
			key: bib.key,
			type: bib.type,
			fields: {},
			openFields: bib.openFields
		};
		abbrBib.fields.title = title.abbr ? title.abbr : bib.fields.title;
		abbrBib.fields.booktitle = abbrBib.fields.title;
		["publisher", "series", "volume", "year"].forEach(function (field) {
			if (bib.fields[field])
				abbrBib.fields[field] = bib.fields[field];
		});
		return [[abbrBib]];

	} else if (bib.type == "inproceedings" && bib.key2) {
		var parts = {};
		var {head, tail} = serializeHeadTail(title);
		parts.title = head;
		parts.proc = tail;
		parts.date = serializeDate(title, true);
		parts.address = serializeAddr(title);
		var key2val = bib.key2 + ":value";
		var openFields = { [key2val]: true, [bib.key2 + ":date"]: true };
		var partStrings = [];
		var booktitle = "";
		var isFirst = true;
		["title", "date", "address", "proc"].forEach(function (key) {
			var key2 = bib.key2 + ":" + key;
			if (parts[key]) {
				partStrings.push({ type: "string", key: key2, value: parts[key], openFields: openFields });
				if (isFirst)
					isFirst = false;
				else
					booktitle += " # {, } # ";
				booktitle += key2;
				if (key == "date")
					bib.openFields[key2] = true;
			}
		});
		partStrings.push({ type: "string", key: key2val, value: booktitle, openFields: openFields });
		var abbrString = { type: "string", key: key2val, value: title.abbr || parts.title, openFields: {} };
		bib.openFields[key2val] = true;
		bib.fields.booktitle = key2val;
		bib.openFields.booktitle = true;
		return [partStrings, [abbrString]];
	}
}

function normalizeIsbn(bib) {
	if (bib.fields.isbn)
		bib.fields.isbn = addIsbnHyphen(toIsbn13(removeIsbnHyphen(bib.fields.isbn)));
}

function removeFields(bib) {
	["timestamp", "biburl", "bibsource", "archivePrefix", "eprint"].forEach(function (field) { delete bib.fields[field]; });
	if (bib.type == "inproceedings" && bib.fields.crossref) delete bib.fields.booktitle;
}

//
// Async Update
//
function updateBibAsync(bib, cb) {
	resolveDoi(bib, cb);
	fetchSpringerDoi(bib, cb);
}

function resolveDoi(bib, cb) {
	if (!bib.fields.doi) return;
	if (bib.fields.url && !bib.fields.url.match("dx.doi.org")) return;
	GM.xmlHttpRequest({
		method: 'GET',
		url: 'http://doi.org/api/handles/' + encodeURIComponent(bib.fields.doi),
		onload: function (response) {
			var json = response.responseText;
			if (!json) return;
			var urlMatched = json.match(/"(https?:\/\/.+?)"/);
			if (!urlMatched) return;
			bib.fields.url = urlMatched[1];
			cb();
		}
	});
}

function fetchSpringerDoi(bib, cb) {
	if (bib.fields.doi) return;
	var isbn = bib.fields.isbn;
	var isSpringer = isbn && ["978-3-540", "978-3-642"].find( function (prefix) { return prefix.startsWith(isbn); });
	if (isSpringer) {
		GM.xmlHttpRequest({
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
// modify dblp page
//
return function () {
	function writeUrl(pre, url) {
		if (url) {
			var a = pre.previousSibling;
			var exists = a.nodeName.toLowerCase() == 'a';
			if (!exists) a = document.createElement('a');
			a.setAttribute('href', url);
			a.textContent = url;
			if (!exists) pre.parentNode.insertBefore(a, pre);
		}
	}
	var xpath = "id('bibtex-section')/pre";
	var nodes = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
	for (var i = 0; i < nodes.snapshotLength; i++) {
		(function () {
			var pre = nodes.snapshotItem(i);
			var origPre = pre.cloneNode(true);
			var origUrl;
			var bibTeXEntry = pre.textContent;
			try {
				var bib = parseBibTeXEntry(bibTeXEntry);
				origUrl = bib.fields.url;
				var subBibsList = updateBib(bib);
				function writePre() {
					pre.textContent = serializeBibTeXEntry(bib);
					writeUrl(pre, bib.fields.url);
				}
				writePre();
				updateBibAsync(bib, writePre);
				if (subBibsList) {
					var currentPre = pre;
					subBibsList.forEach(function (subBibs) {
						var subPre = origPre.cloneNode(true);
						subPre.textContent = subBibs.map(serializeBibTeXEntry).join("");
						currentPre.parentNode.insertBefore(subPre, currentPre.nextSibling);
						currentPre = subPre;
					});
				}
			} catch (e) {
				//console.error(e);
				throw e;
			}
			if (i == 0) {
				var text = document.createTextNode("Original:");
				pre.parentNode.appendChild(text);
			}
			pre.parentNode.appendChild(origPre);
			writeUrl(origPre, origUrl);
		})();
	}
	unsafeWindow.dblp.ui.initTextSelect();
}

})()();
