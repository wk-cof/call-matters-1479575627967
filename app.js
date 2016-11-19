/**
 * Module dependencies.
 */
var express = require('express'), routes = require('./routes'), user = require('./routes/user'), http = require('http'), path = require(
  'path'), fs = require('fs');

var app = express();

var db;

var cloudant;

var fileToUpload;

var dbCredentials = {
  dbName: 'my_sample_db'
};

var bodyParser = require('body-parser');
var methodOverride = require('method-override');
var logger = require('morgan');
var errorHandler = require('errorhandler');
var multipart = require('connect-multiparty')
var multipartMiddleware = multipart();
var govTrack = require('govtrack-node');
var _ = require('lodash-node');
var Q = require('q');
var https = require('https');


// all environments
app.set('port', process.env.PORT || 3000);
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.engine('html', require('ejs').renderFile);
app.use(logger('dev'));
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());
app.use(methodOverride());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/style', express.static(path.join(__dirname, '/views/style')));

// development only
if ('development' == app.get('env')) {
  app.use(errorHandler());
}

var sendError = function(res, err) {
  res.statusCode = 400;
  res.send('Bad request. ' + JSON.stringify(err));
};

var getDescription = function(dataItem) {
  var latestRole = _.filter(dataItem.roles, {current: true});
  if (_.isArray(latestRole)) {
    return latestRole[0].description;
  }
  return latestRole.description;
};

app.get('/', routes.index);

app.get('/api/reps/:repid', function(req, res) {
  govTrack.findPerson({bioguideid: req.param('repid')}, function(err, repData) {
    if (!err) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.send(repData);
    } else {
      sendError(res, err);
    }
  });
});

app.get('/api/reps', function(req, res) {
  var zip = req.query.zip;
  var options = {
    host: 'congress.api.sunlightfoundation.com',
    path: '/legislators'
  };

  if (req.query.zip) {
    options.path += '/locate?zip=' + req.query.zip
  } else if (req.query.longitude && req.query.latitude) {
    options.path += '/locate?longitude=' + req.query.longitude + '&latitude=' + req.query.latitude
  }

  http.request(options, function(response) {
    var str = '';

    //another chunk of data has been recieved, so append it to `str`
    response.on('data', function(chunk) {
      str += chunk;
    });

    //the whole response has been recieved, so we just print it out here
    response.on('end', function() {
      res.setHeader('Content-Type', 'application/json');
      var data = JSON.parse(str);
      dataPromises = _.map(data.results, function(dataItem) {
        //var middleName = dataItem.middle_name ? dataItem.middle_name + ' ' : '';
        return Q.Promise(function(resolve, reject, notify) {
          var intOptions = {
            host: 'www.govtrack.us',
            path: '/api/v2/person/' + dataItem.govtrack_id
          };
          https.get('https://www.govtrack.us/api/v2/person/' + dataItem.govtrack_id, function(otherResp) {
            var repData = '';
            otherResp.on('data', function(chunk) {
              repData += chunk;
            });
            otherResp.on('end', function() {
              var parsedData = JSON.parse(repData);
              dataItem.full_name = parsedData.name;
              dataItem.description = getDescription(parsedData);
              resolve(dataItem);
            });
            otherResp.on('error', function(err) {
              reject(err);
            })
          }).end();
        });
        //dataItem.full_name = dataItem.first_name + ' ' + middleName + dataItem.last_name;
        //return dataItem;
      });

      Q.all(dataPromises).then(function (results) {
        res.send(results);
      });
    });
  }).end();
});

//govTrack.findPerson({ gender: 'male', lastname: 'smith' }, function(err, repData) {
//  //govTrack.findPerson({lastname: dataItem.last_name}, function(err, repData) {
//  if (!err) {
//    dataItem.description = repData.description;
//    dataItem.address = repData.extra.address;
//    return resolve(dataItem);
//  } else {
//    return resolve(dataItem);
//  }
//});

app.get('/api/news', function(req, res) {
  var myApiKey = '2f54d6003ad201e8d8e204f9c5a3349e7d15fb01';
  var query = encodeURI(req.query.name);
  if (!query) {
    return sendError(res, 'You need to specify "name" query parameter');
  }
  var options = {
    host: 'access.alchemyapi.com',
    path: '/calls/data/GetNews?apikey=' +
      myApiKey +
      '&return=enriched.url.title,enriched.url.url&start=1474329600&end=1479596400&q.enriched.url.entities.entity=|text=' +
      query +
      ',type=person|&q.enriched.url.taxonomy.taxonomy_.label=law,%20govt%20and%20politics&count=25&outputMode=json'
  };

  http.request(options, function(response) {
    var str = '';

    //another chunk of data has been recieved, so append it to `str`
    response.on('data', function(chunk) {
      str += chunk;
    });

    //the whole response has been recieved, so we just print it out here
    response.on('end', function() {
      res.setHeader('Content-Type', 'application/json');
      var data = JSON.parse(str);
      res.send(data);
    });
  }).end();
});

http.createServer(app).listen(app.get('port'), '0.0.0.0', function() {
  console.log('Express server listening on port ' + app.get('port'));
});
