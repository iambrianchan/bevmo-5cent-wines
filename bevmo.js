"use strict";
var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
var cheerio = require("cheerio");
var fs = require("fs");
var http = require("http");
var XLSX = require('xlsx');

// module for scraping wines, reviews, generating excel
var cellar = function() {

	// function for getting all html from bevmo 5c wine pages
	// callback returns a string of html that will then be parsed

	function scrapeIds (callback) {
		console.log("Finding wines from Bevmo...");

		// module for getting 5c wine html
		var html = (function () {

			// function for getting html from a single page.
			// callback returns the html from a single pagination.
			function getHtmlFromBevmo (index, callback) {
				index = index % 26;
				var xhr = new XMLHttpRequest();
				var url = 'http://www.bevmo.com/shopby/5cent.html?is_ajax=1&p=' + index + '&is_scroll=1';
				xhr.open('GET', url);
				xhr.setRequestHeader('X-Prototype-Version', '1.7');
				xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
				xhr.onreadystatechange = function() {
					if (xhr.readyState == 4 && xhr.status == 200) {
						var html = JSON.parse(xhr.responseText).page;
						callback(html);
					}
				}
				xhr.send();
			}

			// function that simulates 300 scrapes on bevmo's site.
			// uses getHtmlFromBevmo to return html and finally callback the entire 300 pages of html.
			function returnHtml (callback) {
				var pages = [];
				var results = [];

				for (var i = 0; i < 300; i++) {
					pages.push(i);
				}

				pages.forEach(function(item) {
					getHtmlFromBevmo(item, function joinHtml(result) {
						results.push(result);
						if (results.length == pages.length) {
							callback(results.join(''));
						}
					})
				});
			}

			return {
				getHtml : returnHtml
			}
		})();

		// accessible method of the module uses returnHtml.
		// 300 pages of 5c wine html is returned from callback
		html.getHtml(function (result) {
			callback(result);
		});
	}

	// function that scrapes the data of each wine.
	// returns an array of wine objects
	function scrapeWines (html, callback) {

		// module finds all product ids, scrapes product details from id, and builds an array of wine objects.
		var wines = (function (html) {

			// function filters html for individual product ids.
			// product ids are then used to get product details.
			function filterUniqueWines () {
				var $ = cheerio.load(html);
				var allWines = $('li.item');
				var wineIds = [];

				// function returns only numbers from a string, used to parse product id.
				function getNumbersFromString(string) {
					return string.replace(/\D/g, "");
				}

				allWines.each(function (index, element) {
					var id = $(this).find('span.regular-price, span.price').attr('id');
					id = getNumbersFromString(id);
					if (wineIds.indexOf(id) == -1) {
						wineIds.push(id);					
					}
				});

				return wineIds;		
			}

			// function uses product ids from filterUniqueWines to scrape, then build an array of wine objects
			function buildAllWines (arrayOfIds, callback) {

				// scrapes bevmo with product id to obtain html on individual product.
				// buildWine is then called using html and id to parse the html and return a wine object
				function buildWineFromBevmo (id, callback) {
					var xhr = new XMLHttpRequest();
					var url = 'http://www.bevmo.com/catalog/product/view/id/' + id;
					xhr.open('GET', url);
					xhr.setRequestHeader('X-Prototype-Version', '1.7');
					xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
					xhr.onreadystatechange = function() {
						if (xhr.readyState == 4 && xhr.status == 200) {
							var html = xhr.responseText;
							var wine = buildWine(id, html);
							callback(wine);
						}
					}
					xhr.send();
				}

				// parses the html and builds a wine object.
				function buildWine (id, html) {
					var name, priceElement, currentPrice, regularPrice, rating, type, vintage, region, appellation;

					var $ = cheerio.load(html);
					name = $('div.product-name').eq(0).text()
					name = cleanName(name);

					priceElement = $('div.price-box').eq(0);

					if (priceElement.children().length == 1) {
						currentPrice = priceElement.text();
						regularPrice = priceElement.text();
					}
					else {
						currentPrice = priceElement.find('p.special-price').find('span.price').text();
						regularPrice = priceElement.find('p.old-price').find('span.price').text();
					}

					currentPrice = cleanWord(currentPrice);
					regularPrice = cleanWord(regularPrice);
					rating = $('th:contains("Rating")').next().text();
					rating = cleanRating(rating);
					type = $('th:contains("Type")').next().text();
					type = convertWineType(cleanWord(type));
					vintage = $('th:contains("Vintage")').next().text();
					vintage = cleanWord(vintage);
					region = $('th:contains("Region")').next().text();
					region = cleanWord(region);
					appellation = $('th:contains("Appellation")').eq(0).next().text();
					appellation = cleanWord(appellation);

					// functions for cleaning name, rating, words found from scraping
					function cleanName (name) {
						name = name.replace(/\(.+\)/g, "").replace(/\'[\d]+/g,"").trim();
						return name;
					}
					function cleanRating (rating) {
						rating = rating.trim();
						return rating;
					}
					function cleanWord (word) {
						word = word.trim();
						if (!word) {
							word = "n/a";
						}
						return word;
					}
					// wine is built with scraped values
					var wine = {
						"name" : name,
						"id" : id,
						"currentPrice" : currentPrice,
						"regularPrice" : regularPrice,
						"rating" : rating,
						"type" : type,
						"vintage" : vintage,
						"region" : region,
						"appellation" : appellation
					};
					return wine;
				}

				// all ids are used to build a wine.
				// all resulting wine objects are pushed to wines array which is returned.
				var wines = [];
				arrayOfIds.forEach(function scrape(item) {
					buildWineFromBevmo(item, function (result){
						wines.push(result);
						if (wines.length == arrayOfIds.length) {
							callback(wines);
						}
					});
				})


			}

			// the function that is exposed.
			// filterUniqueWines is called, then buildAllWines is called.
			// returns the array of wine objects
			function returnWines() {
				var ids = filterUniqueWines();
				buildAllWines(ids, function (result) {
					callback(result);
				});
			}

			return {
				getWines : returnWines
			}

		})(html)

		wines.getWines();
	}

	// function scrapes wine enthusiast website for reviews
	function scrapeWineEnthusiast (wines, callback) {

		// module responsible for scraping wine enthusiast, and updating a wine's review
		var wineEnthusiast = (function (wines) {
			function getHtmlFromWineEnthusiast (wine, callback) {
				var html;
				var name = cleanNameForWineEnthusiast(wine.name);
				var options = {
					host: "www.winemag.com",
					path: "/?s=" + name + "&search_type=reviews"
				};

				var scrape = function(response) {
					response.on('data', function (chunk) {
						html += chunk;
						return;
					});
					response.on('error', function (e) {
						console.log('Received error: ' + e.message);
						return;
					});
					response.on('end', function() {
						callback(wine, html);
						return;
					})
				}
				// names must be cleaned up for spaces, the word reserve is sometimes reserva, and &
				function cleanNameForWineEnthusiast(name) {
					name = name.toLowerCase().replace('reserve', 'reserv').replace(' &', "");
					name = name.split(" ").join("+");
					name = name.split("-").join("+");
					return name;
				}

				var req = http.get(options, scrape);
			}

			// parses the html returned from request, returns rating
			function getRatingFromWineEnthusiast (wine, html, callback) {
				var rating;
				var $ = cheerio.load(html);
				var ratings = $('div.results');

				findRating(wine, ratings, function (wine, rating) {
					callback(wine, rating);
				});

				// parses html and returns rating
				function findRating(wine, ratings, callback) {
					var rating;
					var name = wine.name.toLowerCase();
					name = name.replace('reserve', 'reserv').replace(' &', '');

					var nameArray = name.split(' ');

					// go through each rating	
					for (var i = 0; i < ratings.length; i++) {
						var title = ratings.eq(i).find('div.title').text().toLowerCase();

						// check if every word in wine title is contained in rating title
						for (var j = 0; j < nameArray.length; j++) {
							var keyWord = nameArray[j];

							if (title.search(keyWord) == -1) {
								break;
							}
							else if (j == nameArray.length - 1) {
								rating = ratings.eq(i).find('span.rating').text();
								rating = rating.substring(0, 2);
							}
						}
					}
					callback(wine, rating);
				}
			}

			// exposed function for wineEnthusiast module
			function returnWinesWithWineEnthusiastRating(wines, callback) {
				var correctedWines = [];
				wines.forEach(function getHtml(wine) {
					getHtmlFromWineEnthusiast(wine, function parseHtml(wine, html) {
						getRatingFromWineEnthusiast(wine, html, function addRatingToWine(wine, rating) {
							if (rating != undefined && !wine.rating) {
								wine.rating = rating;
							}
							if (!wine.rating) {
								wine.rating = "n/a";
							}
							correctedWines.push(wine);

							if (correctedWines.length == wines.length) {
								callback(correctedWines);
							}
						})
					})
				})
			}

			return {
				getWinesWithWineEnthusiastRating : returnWinesWithWineEnthusiastRating
			}
			
		})(wines);
		wineEnthusiast.getWinesWithWineEnthusiastRating(wines, function addWineRatings(result) {
				callback(result);
			});
	}

	// generates an excel sheet from the array of wine objects
	function makeExcel(wines) {
		function datenum(v, date1904) {
			if(date1904) v+=1462;
				var epoch = Date.parse(v);
			return (epoch - new Date(Date.UTC(1899, 11, 30))) / (24 * 60 * 60 * 1000);
		}

		function createExcel(data, opts) {
			var ws = {};
			var range = {s: {c:10000000, r:10000000}, e: {c:0, r:0 }};
			for(var R = 0; R != data.length; ++R) {

				// Set column names if R = 0
				if (R < 1) { 
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
				// set each product as a row in the table
				else { 
					// loop through each product
					for (var C = 0; C < data[R].length; ++C) {
						// loop through each product attribute
						for (var i = 0; i < data[0].length; i++) {
							var cell;
							switch(i) {
								case 0:
									cell = {v: data[R][C].name};
									break;
								case 1:
									cell = {v: "http://www.bevmo.com/catalog/product/view/id/" + data[R][C].id};
									break;
								case 2:
									cell = {v: data[R][C].currentPrice};
									break;
								case 3:
									cell = {v: data[R][C].regularPrice};
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

		// data is an array with a subarray for column titles, and the array of wines
		var data = [['Name', 'Link', 'Current Price', 'Regular Price', 'Rating', 'Type', 'Vintage', 'Region', 'Appellation']];
		data.push(wines);

		var ws_name = "5¢ Wines";

		function Workbook() {
			if(!(this instanceof Workbook)) return new Workbook();
			this.SheetNames = [];
			this.Sheets = {};
		}

		var wb = new Workbook();
		var ws = createExcel(data);
		/* add worksheet to workbook */
		wb.SheetNames.push(ws_name);
		wb.Sheets[ws_name] = ws;

		/* write file */
		XLSX.writeFile(wb, '5¢ Wines.xlsx');
	}

	// helper function that converts type from bevmo into generic types
	function convertWineType(type) {
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

	// point of entry for program
	function findAllWines() {
		scrapeIds(function (ids) {

			// scrape bevmo from product id to get information on each wine
			scrapeWines(ids, function (wines) {
				console.log("found " + wines.length + " wines")

				// scrape wine enthusiast and try to add rating to wine if it didn't get one from bevmo
				scrapeWineEnthusiast(wines, function (correctedWines) {

	   				// format wines into an exel
	   				 makeExcel(correctedWines);
				});

			});
		});		
	};

	return {
		findWines : findAllWines,
		convertWineType : convertWineType
	}
}();

cellar.findWines();

exports.convertWineType = cellar.convertWineType;