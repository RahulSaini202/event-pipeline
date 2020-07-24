/**
 * A Connection handler for Amazon ES.
 *
 * Uses the aws-sdk to make signed requests to an Amazon ES endpoint.
 * Define the Amazon ES config and the connection handler
 * in the client configuration:
 *
 ** MODIFIED BY FOR SPECIFIC SUPPORT for latest aws guidlines::MOHIT Malik
 *
 * @param client {Client} - The Client that this class belongs to
 * @param config {Object} - Configuration options
 * @param [config.protocol=http:] {String} - The HTTP protocol that this connection will use, can be set to https:
 * @class HttpConnector
 */
let AWS = require('aws-sdk');
let HttpConnector = require('elasticsearch/src/lib/connectors/http')
let _ = require('elasticsearch/src/lib/utils');
let zlib = require('zlib');

class HttpAmazonESConnector extends HttpConnector {
  constructor(host, config) {
    super(host, config);
    this.endpoint = new AWS.Endpoint(host.host);
    let c = config.amazonES;
    c = {
        region: 'ap-south-1',
        accessKey: '-',
        secretKey: '-'
    };
    //this.creds = new AWS.Credentials(c.accessKey, c.secretKey);
    this.amazonES = c;
  }

  request(params, cb) {
    var incoming;
    var timeoutId;
    var request;
    var req;
    var status = 0;
    var headers = {};
    var log = this.log;
    var response;

    var reqParams = this.makeReqParams(params);
    // general clean-up procedure to run after the request
    // completes, has an error, or is aborted.
    

    request = new AWS.HttpRequest(this.endpoint,this.amazonES.region);
    log.trace("================================= ",this.amazonES.region,"==================");
    // copy across params
    for (let p in reqParams) {
      request[p] = reqParams[p];
    }
    request.region = this.amazonES.region;
    if (params.body) request.body = params.body;
    if (!request.headers) request.headers = {};
    //request.headers['presigned-expires'] = false;
    request.headers['host'] = this.endpoint.host;
    request.headers['Content-Type'] = 'application/json';
    // Content-Length is only needed for DELETE requests that include a request
    // body, but including it for all requests doesn't seem to hurt anything.
    request.headers['Content-Length'] = Buffer.byteLength(request.body);
  

    // Sign the request (Sigv4)
    var credentials = new AWS.EnvironmentCredentials('AWS');
    var signer = new AWS.Signers.V4(request, 'es');
    signer.addAuthorization(credentials, new Date());
    

    //var send = new AWS.NodeHttpClient();
    var client = new AWS.HttpClient();
    req = client.handleRequest(request, null, function(response) {
      console.log(response.statusCode + ' ' + response.statusMessage);
      var responseBody = '';
      response.on('data', function (chunk) {
        responseBody += chunk;
      });
      response.on('end', function (chunk) {
        console.log('Response body Of connector:  ' + responseBody);
        cb(null, responseBody);
        
      });
    }, function(error) {
      console.log('Error connector: ' + error);
      cb(error);
    });

    req.setNoDelay(true);
    req.setSocketKeepAlive(true);

    return function () {
      req.abort();
    };
  }
}

module.exports = HttpAmazonESConnector;