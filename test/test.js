var expect = require('chai').expect;

var bevmo = require('../bevmo');

describe('convertWineType', function() {
  var typeMap = {
    "Other Reds": "Other Red",
    "Other Whites": "Other White",
    "Tempranillo": "Other Red",
    "Moscato": "Other",
    "Barbera": "Other Red",
    "Chianti": "Other Red",
    "Bordeaux": "Other",
    "Port": "Other Red",
    "Blush": "Other",
    "Nero d'Avola": "Other Red",
    "Rioja": "Other Red",
    "Fortified/Dessert": "Other",
    "Petite Sirah": "Other Red",
    "Gewurztraminer": "Other White",
    "Cabernet Franc": "Other Red",
    "Other Italian": "Other",
    "Pinot Grigio/Pinot Gris": "Other White",
    "Riesling": "Other White",
    "Rhone": "Other",
    "Viognier": "Other White",
    "Sake": "Other",
    "Syrah/Shiraz": "Other Red",
    "Burgundy": "Other",
    "Rose/Blush": "Other",
    "Muscat": "Other"
  };

  it('should convert all recognized wine types', function() {
    Object.keys(typeMap).map(function(type) {
      var expectedType = typeMap[type];
      var convertedType = bevmo.convertWineType(type);
      expect(convertedType).to.equal(expectedType);
    });
  });
});
