var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
var cheerio = require("cheerio");
var fs = require("fs");
var http = require("http");
var XLSX = require('xlsx');


cellar = [];
var size = 0;

if (!module.parent) {
	getWines();
}

var start = new Date();

function getWines() {
	console.log("Finding wines from Bevmo");
	var results = [];
	var pages = [];
	for (var i = 1; i < 300; i++) {
		pages.push(i);
	}
	function scrape(index, callback) { // function that will make and send xhr
		index = index % 26;

		var html = "";
		var xhr = new XMLHttpRequest();
		var url = 'http://www.bevmo.com/shopby/5cent.html?is_ajax=1&p=' + index + '&is_scroll=1';
		xhr.open('GET', url);
		xhr.setRequestHeader('X-Prototype-Version', '1.7');
		xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
		xhr.onreadystatechange = function() {
		    	if ( xhr.readyState == 4 && 200 == xhr.status ) {
		    		html = JSON.parse(xhr.responseText).page;
		        	callback(html);
		   		}
		}
		xhr.send();
	}

	pages.forEach(function(item) {
		scrape(item, function(result) {
			results.push(result);
			if (results.length == pages.length) {
				sortWines(results.join(''));
			}
		})
	});
}

function myIndexOf(wines, wine) {    
    for (var i = 0; i < wines.length; i++) {
        if (wines[i].name == wine.name && wines[i].id == wine.id) {
            return i;
        }
    }
    return -1;
}

function getNumbersFromString(string) {
	return string.replace(/\D/g, "");
}

// Use this function to format money with more than 3 digits.
// Number.prototype.formatMoney = function(c, d, t){
// var n = this, 
//     c = isNaN(c = Math.abs(c)) ? 2 : c, 
//     d = d == undefined ? "." : d, 
//     t = t == undefined ? "," : t, 
//     s = n < 0 ? "-" : "", 
//     i = parseInt(n = Math.abs(+n || 0).toFixed(c)) + "", 
//     j = (j = i.length) > 3 ? j % 3 : 0;
//    return s + (j ? i.substr(0, j) + t : "") + i.substr(j).replace(/(\d{3})(?=\d)/g, "$1" + t) + (c ? d + Math.abs(n - i).toFixed(c).slice(2) : "");
//  };

function sortWines(html) {
	$ = cheerio.load(html);
	var cheerio_wines = $('li.item');
	var wines = [];

	cheerio_wines.each(function(index, element) {
		var name = $(this).find('h2.product-name a').attr('title'); // get the name from the item.
		name = name.replace(/\(.+\)/g, "").replace(/\'[\d]+/g,"").trim();
		var price;
		var priceBox = $(this).find('div.price-box'); // this price box contains the price.

		if (priceBox.find('p.special-price').length > 0) {
			price = priceBox.find('p.special-price').find('span.price').text();
		}
		else {
			price = priceBox.find('span.price').eq(0).text();
		}
		var regularPrice = 0;
		price = Number(price.replace(/[^0-9\.]+/g,""));

		if ($(this).find('p.availability.out-of-stock').length > 0) { // in case an item is out of stock, we set price to the string.
					regularPrice = price;
					price = 'Out of stock';
		}
		var id = $(this).find('span.regular-price, span.price').attr('id');
		id = getNumbersFromString(id);

		var wine = {  //the basic wine object, more keys will be added later.
			'name': name,
			'price': price,
			'id': id,
			'regularPrice': regularPrice
			};
		if (myIndexOf(wines, wine) == -1) {
			wines.push(wine);
		}
	});
	size = wines.length; // set the number of wines for later reference
	console.log('\nfound: ' + wines.length + ' wines.');
	console.log("######################################################");
	console.log("Getting reviews for wines");
	return getReview(wines);  
}

function getReview(wines) {
	cellar = [];

	function getBevmoReview(wine, check) { // function to make and send get request to bevmo for each individual wine
		var id = wine.id;
		var html;
		var url = 'www.bevmo.com';
		var options = {
			host: url,
			port: 80,
			path: '/catalog/product/view/id/' + id
		};
		var callback = function(response) {
			response.on('data', function (chunk) {
		    	html += chunk;
		    	return;
		  	});

			response.on('error', function(e) {
				console.log('got error: ' + e.message);
				return;
			})

		  	response.on('end', function () {
		  		var data = extractReview(html);
		  		if (!wine.regularPrice) {  // if the item was out of stock this key will have a string value.
		  			wine.regularPrice = data.regularPrice;
		  		}
		    	wine.rating = data.rating;
		    	wine.type =  data.type;
		    	wine.vintage = data.vintage;
		    	wine.region = data.region;
		    	wine.appellation = data.appellation;
		    	check(wine);
		  	});
		}
		var req = http.get(options, callback);
	}

	wines.forEach(function(item) {
		getBevmoReview(item, function(result) {
			if (!result.rating) {
				getWineEnthusiastReview(result, function(result) {
					pushToCellar(result);
				});
			}
			else {
				pushToCellar(result);
			}
		});
	});
}


function extractReview(chunk) {
	$ = cheerio.load(chunk);
	var regularPrice = $('span.price').eq(0).text();  // find the regular price of the product.
	regularPrice = Number(regularPrice.replace(/[^0-9\.]+/g,""));

	var table = $('#product-attribute-specs-table');
	trr = table.find('tbody tr');
	var rating = "";
	var type, vintage, region, appellation;
	type = vintage = region = appellation = "n/a";

	for (var i = 0; i < trr.length; i++) {
		if (trr.eq(i).children().eq(0).text() == "Type/Varietal") {  // find the type
			type = trr.eq(i).children().eq(1).text().trim();
			type = convertWineType(type);
		}
		if (trr.eq(i).children().eq(0).text() == "Vintage") {  // find the vintage
			vintage = trr.eq(i).children().eq(1).text().trim();
		}

		if (trr.eq(i).children().eq(0).text() == "Region") {  // find the region
			region = trr.eq(i).children().eq(1).text().trim();
		}

		if (trr.eq(i).children().eq(0).text() == "Appellation") {  // find the appellation
			appellation = trr.eq(i).children().eq(1).text().trim();
		}
		if (trr.eq(i).children().eq(0).text().search("Rating") != -1) {  // find the rating
			rating = trr.eq(i).children().eq(1).text().trim();
		}
	}
	return {'rating': rating, 'type': type, 'vintage': vintage, 'region': region, 'appellation': appellation, 'regularPrice': regularPrice}; // return a data object with the extracted values.
}

function pushToCellar(wine) {
	cellar.push(wine);

	if (cellar.length == size) {  // if the array is the same length as size variable set earlier, create the excel
		cellar.sort(function(a, b) {
			return a.price - b.price;
		});
		console.log("######################################################");
		console.log("Creating excel from " + cellar.length + " wines")
		makeExcel(cellar);
		var end = new Date();
		var timeElapsed = (end - start) / 1000;
		console.log('Process took: ' + timeElapsed + ' seconds');
	}
}

function getWineEnthusiastReview(wine, callback) {
		var html;
		var name = wine.name.toLowerCase();
		name = name.replace('reserve', 'reserv').replace(' &', "");
		name = name.split(" ").join("+");
		name = name.split("-").join("+");

		// old code from before winemag got an overhaul

		// var url = 'www.buyingguide.winemag.com/search?q=';
		// var xhr = new XMLHttpRequest();
		// xhr.open("GET", "http://buyingguide.winemag.com/search?q=" + name);
		// xhr.onreadystatechange = function() {
		//     	if ( xhr.readyState == 4 && 200 == xhr.status ) {
		//     		console.log(xhr.responseText);
		// 			wine = extractWineEnthusiastReview(wine, xhr.responseText);
		// 			console.log(wine);
		// 			callback(wine);
		//         	return;
		//    		}
		//    		// console.log(wine);
		// }
		// xhr.send();
		// var url = "www.winemag.com";
		var options = {
			host: "www.winemag.com",
			port: 80,
			path: "/?s=" + name + "&search_type=reviews"
		};
		var scrape = function (response) {
			response.on('data', function (chunk) {
				html += chunk;
				return;
			});
			response.on('error', function (e) {
				console.log('got error: ' + e.message);
				return;
			});
			response.on('end', function () {
				wine = extractWineEnthusiastReview(wine, html);
				callback(wine);
				return;
			})
		}
		var req = http.get(options, scrape);
}

function extractWineEnthusiastReview(wine, chunk) {
	var rating = 'n/a';
	wine.rating = rating;

	$ = cheerio.load(chunk);
	var ratings = $('div.results'); // all matches found will be in this ratings variable
	if (ratings.length > 0) {
		findRating(wine, ratings);
	}

	function findRating(wine, ratings) {
		var rating;
		var name = wine.name.toLowerCase();
		name = name.replace('reserve', 'reserv').replace(' &', '');
		var nameArray = name.split(' '); // all words in the array will be looked for in the returned matches

		for (var x = 0; x < ratings.length; x++) {
			var title = ratings.eq(x).find('div.title').text().toLowerCase();
			for (var i = 0; i < nameArray.length; i++) {
				var keyWord = nameArray[i];

				if (title.search(keyWord) == -1) { // if a matched item does not have a word in the product name, move to next match
					break;
				}
				else if (i == nameArray.length - 1) {  // if the last word checks out, find the vintage and if it is newer than stored vintage, set the rating.
					rating = ratings.eq(x).find('span.rating').text();
					rating = rating.substring(0,2);
					wine.rating = rating;
					return
				}
			}
		}
	}

	return wine;
}

function convertWineType(type) {  // converts type from bevmo into generic types
	switch (type) {
			case "Other Reds":
				return "Other Red";
			case "Other Whites":
				return "Other White";
			case "Tempranillo":
				return "Other Red";
			case "Moscato":
				return "Other";
			case "Barbera":
				return "Other Red";
			case "Chianti":
				return "Other Red";
			case "Bordeaux":
				return "Other";
			case "Port":
				return "Other Red";
			case "Blush":
				return "Other";
			case "Nero d'Avola":
				return "Other Red";
			case "Rioja":
				return "Other Red";
			case "Fortified/Dessert":
				return "Other";
			case "Petite Sirah":
				return "Other Red";
			case "Gewurztraminer":
				return "Other White";
			case "Cabernet Franc":
				return "Other Red";
			case "Other Italian":
				return "Other";
			case "Pinot Grigio/Pinot Gris":
				return "Other White";
			case "Riesling":
				return "Other White";
			case "Rhone":
				return "Other";
			case "Viognier":
				return "Other White";
			case "Sake":
				return "Other";
			case "Syrah/Shiraz":
				return "Other Red";
			case "Burgundy":
				return "Other";
			case "Rose/Blush":
				return "Other";
			case "Muscat":
				return "Other";
			default:
				return type;
		}
	}

function makeExcel(wines) {
	function datenum(v, date1904) {
	if(date1904) v+=1462;
	var epoch = Date.parse(v);
	return (epoch - new Date(Date.UTC(1899, 11, 30))) / (24 * 60 * 60 * 1000);
}

function sheet_from_array_of_arrays(data, opts) {
	var ws = {};
	var range = {s: {c:10000000, r:10000000}, e: {c:0, r:0 }};
	for(var R = 0; R != data.length; ++R) {
		if (R < 1) { // set the column names
			for(var C = 0; C != data[0].length; ++C) {
				if(range.s.r > R) range.s.r = R;
				if(range.s.c > C) range.s.c = C;
				if(range.e.r < R) range.e.r = R;
				if(range.e.c < C) range.e.c = C;
				var cell = {v: data[R][C] };
				if(cell.v == null) continue;
				var cell_ref = XLSX.utils.encode_cell({c:C,r:R});
				
				if(typeof cell.v === 'number') cell.t = 'n';
				else if(typeof cell.v === 'boolean') cell.t = 'b';
				else if(cell.v instanceof Date) {
					cell.t = 'n'; cell.z = XLSX.SSF._table[14];
					cell.v = datenum(cell.v);
				}
				else cell.t = 's';
				
				ws[cell_ref] = cell;
			}		
		}
		else { // set each product as a row in the table
			for (var C = 0; C < data[R].length; ++C) {
				for (var i = 0; i < data[0].length; i++) {
					var cell;
					switch(i) {
						case 0:
							cell = {v: data[R][C].name};
							break;
						case 1:
							if (typeof data[R][C].price == "string") {
								cell = {v: data[R][C].price};
								break;
							}
								cell = {v: '$' + data[R][C].price};
								break;
						case 2:
							cell = {v: data[R][C].id};
							break;
						case 3:
							cell = {v: '$' + data[R][C].regularPrice};
							break;
						case 4:
							cell = {v: data[R][C].rating};
							break;
						case 5:
							cell = {v: data[R][C].type};
							break;
						case 6:
							cell = {v: data[R][C].vintage};
							break;
						case 7:
							cell = {v: data[R][C].region};
							break;
						case 8:
							cell = {v: data[R][C].appellation};
							break;
					}
					// if(range.s.r > R) range.s.r = R;
					// if(range.s.c > C) range.s.c = C;
					if(range.e.r < C + 1) range.e.r = C + 1;
					// if(range.e.c < C) range.e.c = C;
					var row = C + 1;
					var cell_ref = XLSX.utils.encode_cell({c:i,r:row});
					if(typeof cell.v === 'number') cell.t = 'n';
					else if(typeof cell.v === 'boolean') cell.t = 'b';
					else if(cell.v instanceof Date) {
						cell.t = 'n'; cell.z = XLSX.SSF._table[14];
						cell.v = datenum(cell.v);
					}
					else cell.t = 's';
					ws[cell_ref] = cell;
				}
			}
		}
	}
	if(range.s.c < 10000000) ws['!ref'] = XLSX.utils.encode_range(range);
	return ws;
}

/* data */
var data = [['Name', 'Price', 'ID', 'Regular Price', 'Rating', 'Type', 'Vintage', 'Region', 'Appellation']];
data.push(wines);

var ws_name = "5centWines";

function Workbook() {
	if(!(this instanceof Workbook)) return new Workbook();
	this.SheetNames = [];
	this.Sheets = {};
}

var wb = new Workbook(), ws = sheet_from_array_of_arrays(data);

/* add worksheet to workbook */
wb.SheetNames.push(ws_name);
wb.Sheets[ws_name] = ws;

/* write file */
XLSX.writeFile(wb, '5centwines.xlsx');

}

exports.convertWineType = convertWineType;
