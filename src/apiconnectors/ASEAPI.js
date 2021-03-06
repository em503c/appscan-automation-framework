// Dependecies
const config = require('../../config/config')
const logger = require('../../config/logger');
var request = require('request');
var fs = require('fs');
var FormData = require('form-data');
const path = require('path');
var moment = require('moment');
var url = require("url"),
    env = process.env;
const util = require('../util.js');


var proxy = {
    protocol: "http:",
    hostname: config.aseProxy.hostName,
    port: config.aseProxy.port,
}
var proxyRequests = function () {
    var proxyUrl = url.format(proxy);
    env.http_proxy = proxyUrl;
    env.https_proxy = proxyUrl;
    env.NODE_TLS_REJECT_UNAUTHORIZED = 0;
}
if (config.aseProxy.useProxy) {
    proxyRequests();
}
// Global variables
var token = {
    sessionID: null,
    cookie: null,
    timeCreated: null
}
// How often to refresh the ASE token so it does not expire in minutes
const ASETokenRefreshTime = 20;
// URL for AppScan Enterprise
var ASEURL = config.ASEURL;


// Exportable functions --------------------------------
module.exports = {
    doGet: function (url, header) {
        return new Promise((resolve, reject) => {
            get(url, function (err, response) {
                if (err) {
                    reject(err);
                } else {
                    resolve(response);
                }
            }, header)
        })
    },

    doPost: function (url, body, header) {
        return new Promise((resolve, reject) => {
            post(url, body, function (err, response) {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(response);
                }
            }, header)
        })
    },

    doUploadDASTFile: function (url, body, fileLoc) {
        return new Promise((resolve, reject) => {
            uploadDASTFile(url, body, fileLoc, function (err, response) {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(response);
                }
            })
        })
    },


    doUploadContentJobTraffic: function (url, fileLoc) {
        return new Promise((resolve, reject) => {
            uploadContentJobTraffic(url, fileLoc, function (err, response) {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(response);
                }
            })
        })
    },

    doDelete: function (url, body, header) {
        return new Promise((resolve, reject) => {
            del(url, body, function (err, response) {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(response);
                }
            }, header)
        })
    },

    doPut: function (url, body) {
        return new Promise((resolve, reject) => {
            put(url, body, function (err, response) {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(response);
                }
            })
        })
    },

    doDownload: function (url, targetSubDir) {
        return new Promise((resolve, reject) => {
            download(url, targetSubDir, function (err, data) {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(data);
                }
            })
        })
    },

    doUpload: function (url, body, fileLoc) {
        return new Promise((resolve, reject) => {
            uploadFile(url, body, fileLoc, function (err, response) {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(response);
                }
            })
        })
    }


}
// END Exportable functions ------------------------------------


// Use API Token to log into ASE
var loginToASE = function (callback) {
    if (token.sessionID && moment().unix() < (parseInt(token.timeCreated) + (parseInt(ASETokenRefreshTime) * 60))) {
        //token still valid
        callback();
    } else {
        if (!config.ASEKeyId || !config.ASEKeySecret) {
            return logger.error('ASE API key ID and/or key secret is missing.  Please add them to config.js (ASEKeyId, ASEKeySecret)');
        }
        // token not valid
        console.log('Logging into AppScan Enterprise...');
        var loginURL = ASEURL + '/keylogin/apikeylogin'
        var loginBody = {
            keyId: config.ASEKeyId,
            keySecret: config.ASEKeySecret
        }
        request({
            url: loginURL,
            method: "POST",
            json: true,
            body: loginBody,
            rejectUnauthorized: false
        }, function (error, response, body) {
            // console.log('RESPONSE: ' + JSON.stringify(response))
            // console.log('RESPONSE ERROR: ' + JSON.stringify(error))
            if (response != undefined) {
                token.cookie = response.headers['set-cookie'];
                //console.log('TOKEN: ' + body.sessionId)
                token.sessionID = body.sessionId;
                token.timeCreated = moment().unix();
                callback();
            }
            else {
                logger.error('Can not connect to AppScan Enterprise Server at host: ' + ASEURL + '.  Make sure you can connect to this host first!');
                if (global.emitErrors) util.emitError(error);
            }
        })
    }
}






var get = function (url, callback, header) {
    loginToASE(function () {
        let requestURL = ASEURL + url
        let headerInfo = {
            headers: {
                Cookie: token.cookie,
                asc_xsrf_token: token.sessionID
            }
        }
        if (header) {
            if (header.range) {
                headerInfo.headers['Range'] = header.range;
            }
            if (header.Accept) {
                headerInfo.headers.Accept = header.Accept
            }
        }
        //console.log('GET headers: ' + JSON.stringify(headerInfo));
        request({
            headers: headerInfo.headers,
            url: requestURL,
            method: "GET",
            json: true,   // <--Very important!!!
            rejectUnauthorized: false,
            //encoding: null *was commented out because of issue ID: #40
        }, function (error, response) {
            if (error) {
                callback(error, null);
            } else {
                if (response.statusCode == 401) {
                    logger.error('Error trying to call ASE, ' + response.body.errorMessage);
                }
                if (response.headers.location == '/ase/LicenseWarning.aspx') {
                    logger.error('Error your AppScan Enterprise license is expiring soon warning.  You must extend your license to resolve this know issue with certain API endpoints.  (Legacy API)');
                }
                callback(null, response);
            }
        })
    })
}

const sanitize = require("sanitize-filename");
var download = function (url, targetSubDir, callback, header) {
    //TODO update tmpFolderLoc to be defined in config
    let tmpFolderLoc = './tmp/';
    let downloadPath = tmpFolderLoc;
    if (targetSubDir) {
        downloadPath = path.join(tmpFolderLoc, sanitize(targetSubDir));
    }

    loginToASE(function () {
        let requestURL = ASEURL + url
        //let requestURL = url
        let headerInfo = {
            headers: {
                Cookie: token.cookie,
                asc_xsrf_token: token.sessionID,
                Accept: "application/octet-stream",
                "Accept-Language": "en-US,en;q=0.5",
                "Accept-Encoding": "gzip, deflate"
            }
        }
        if (header) {
            if (header.range) {
                headerInfo.headers['Range'] = header.range;
            }
            if (header.Accept) {
                headerInfo.headers.Accept = header.Accept;
            }
        }
        request({
            headers: headerInfo.headers,
            url: requestURL,
            method: "GET",
            json: true,   // <--Very important!!!
            rejectUnauthorized: false,
            encoding: null
        })
            .on('response', function (res) {
                //console.log('response' + JSON.stringify(res));
                if (res.statusCode == 401) {
                    logger.error('Error trying to call ASE, ' + response.body.errorMessage);
                }
                /*
                if (res.headers.location == '/ase/LicenseWarning.aspx') {
                    logger.error('Error your AppScan Enterprise license is expiring soon warning.  You must extend your license to resolve this know issue with certain API endpoints.  (Legacy API)');
                }
                */
                if (res.statusCode == 200) {
                    // extract filename
                    //et filename = regexp.exec(res.headers['content-disposition'])[1];

                    let filename = 'AppScanReportOutput-' + Date.now() + '.zip';
                    //console.log('filename' + filename);

                    // create file write stream
                    let fws = fs.createWriteStream(path.join(downloadPath, filename));

                    // setup piping of data
                    res.pipe(fws);

                    res.on('end', () => {
                        callback(null, {
                            success: true,
                            location: path.join(downloadPath, filename)
                        })
                    })
                }
            })
            .on('error', function (err) {
                console.log('response' + JSON.stringify(err));
                callback(err, null);
            })
    })
}




var post = function (url, body, callback, header) {
    loginToASE(function () {
        let requestURL = ASEURL + url;
        let headerInfo = {
            headers: {
                Cookie: token.cookie,
                asc_xsrf_token: token.sessionID
            }
        }
        if (header) {
            if (header['If-Match']) {
                headerInfo.headers['If-Match'] = header['If-Match'];
            }
            if (header.Accept) {
                headerInfo.headers.Accept = header.Accept
            }
        }

        request({
            headers: headerInfo.headers,
            url: requestURL,
            method: "POST",
            json: true,   // <--Very important!!!
            body: body,
            rejectUnauthorized: false
        }, function (error, response) {
            if (error) {
                callback(error, null);
            } else {
                if (response.headers.location == '/ase/LicenseWarning.aspx') {
                    logger.error('Error your AppScan Enterprise license is expiring soon warning.  You must extend your license to resolve this know issue with certain API endpoints.  (Legacy API)');
                }
                if (response.statusCode == 401) {
                    // logger.error('Error trying to create folder on AppScan Enterprise, the folder could already exist or ' + response.body.errorMessage);
                }
                callback(null, response);
            }
        })
    })
}






var del = function (url, body, callback, header) {
    loginToASE(function () {
        let requestURL = ASEURL + url;
        let headerInfo = {
            headers: {
                Cookie: token.cookie,
                asc_xsrf_token: token.sessionID
            }
        }
        if (header) {
            if (header['If-Match']) {
                headerInfo.headers['If-Match'] = header['If-Match'];
            }
            if (header.Accept) {
                headerInfo.headers.Accept = header.Accept
            }
        }

        request({
            headers: headerInfo.headers,
            url: requestURL,
            method: "DELETE",
            json: true,   // <--Very important!!!
            body: body,
            rejectUnauthorized: false
        }, function (error, response) {
            if (error) {
                callback(error, null);
            } else {
                if (response.headers.location == '/ase/LicenseWarning.aspx') {
                    logger.error('Error your AppScan Enterprise license is expiring soon warning.  You must extend your license to resolve this know issue with certain API endpoints.  (Legacy API)');
                }
                callback(null, response);
            }
        })
    })
}






var put = function (url, body, callback) {
    loginToASE(function () {
        let requestURL = ASEURL + url
        request({
            headers: {
                Cookie: token.cookie,
                asc_xsrf_token: token.sessionID
            },
            url: requestURL,
            method: "PUT",
            json: true,   // <--Very important!!!
            body: body,
            rejectUnauthorized: false
        }, function (error, response) {
            if (error) {
                callback(error, null);
            } else {
                if (response.headers.location == '/ase/LicenseWarning.aspx') {
                    logger.error('Error your AppScan Enterprise license is expiring soon warning.  You must extend your license to resolve this know issue with certain API endpoints.  (Legacy API)');
                }
                callback(null, response);
            }
        })
    })
}

var upload = function (url, body, fileLoc, uploadType, callback) {
    if (!fs.existsSync(fileLoc)) {
        callback('File not found: ' + fileLoc, null, null);
        return;
    }

    loginToASE(() => {
        let requestURL = ASEURL + url
        //Construct the form, first with all of the body parameters, then with the file
        const fd = new FormData();
        const headers = {
            Cookie: token.cookie,
            asc_xsrf_token: token.sessionID,
            'Content-Type': 'multipart/form-data; boundary=' + fd.getBoundary(),
            Accept: "application/json, text/javascript, */*; q=0.01",
            'Accept-Encoding': 'gzip, deflate, br',
        };
        if (body) {
            Object.keys(body).forEach(function (key) {
                const val = body[key];
                fd.append(key, (typeof val === 'object' ? JSON.stringify(val) : val));
            });
        }
        if (uploadType == 'dast_file') {
            fd.append('asc_xsrf_token', token.sessionID)
            headers['Accept-Language'] = 'en-US,en';
        }
        if (uploadType == 'content_job') {
            headers['X-Requested-With'] = 'XMLHttpRequest';
            fd.append('uploadfile', fs.createReadStream(fileLoc), { 'Content-Disposition': 'form-data', 'Content-Type': 'application/octet-stream', filename: path.basename(fileLoc) });
        } else {
            fd.append('uploadedfile', fs.createReadStream(fileLoc), { contentType: 'application/xml', filename: path.basename(fileLoc) });
        }

        request({
            headers: headers,
            url: requestURL,
            method: "POST",
            json: false,
            body: fd,
            rejectUnauthorized: false
        }, function (error, response) {
            if (error) {
                callback(error, null);
            } else {
                if (response.headers.location == '/ase/LicenseWarning.aspx') {
                    logger.error('Error your AppScan Enterprise license is expiring soon warning.  You must extend your license to resolve this know issue with certain API endpoints.  (Legacy API)');
                }
                callback(null, response);
            }
        });
    })
}









var uploadDASTFile = function (url, body, fileLoc, callback) {
    loginToASE(function () {
        let requestURL = ASEURL + url
        //Construct the form, first with all of the body parameters, then with the file
        const fd = new FormData();
        fd.append('asc_xsrf_token', token.sessionID)

        const headers = {
            Cookie: token.cookie,
            asc_xsrf_token: token.sessionID,
            'Content-Type': 'multipart/form-data; boundary=' + fd.getBoundary(),
            Accept: "application/json, text/javascript, */*;q=0.01",
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Language': 'en-US,en'
        };
        if (body) {
            Object.keys(body).forEach(function (key) {
                const val = body[key];
                fd.append(key, (typeof val === 'object' ? JSON.stringify(val) : val));
            });
        }

        if (!fs.existsSync(fileLoc)) {
            callback('File not found: ' + fileLoc, null, null);
            return;
        }

        fd.append('uploadedfile', fs.createReadStream(fileLoc), { contentType: 'application/xml', filename: path.basename(fileLoc) });

        request({
            headers: headers,
            url: requestURL,
            method: "POST",
            json: false,
            body: fd,
            rejectUnauthorized: false
        }, function (error, response) {
            if (error) {
                callback(error, null);
            } else {
                if (response.headers.location == '/ase/LicenseWarning.aspx') {
                    logger.error('Error your AppScan Enterprise license is expiring soon warning.  You must extend your license to resolve this know issue with certain API endpoints.  (Legacy API)');
                }
                callback(null, response);
            }
        });
    })
}


var uploadContentJobTraffic = function (url, fileLoc, callback) {
    loginToASE(function () {
        let requestURL = ASEURL + url

        const fd = new FormData();

        const headers = {
            'Cookie': token.cookie,
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'X-Requested-With': 'XMLHttpRequest',
            'Content-Type': 'multipart/form-data; boundary=' + fd.getBoundary(),
            'asc_xsrf_token': token.sessionID
        };

        if (!fs.existsSync(fileLoc)) {
            callback('File not found: ' + fileLoc, null, null);
            return;
        }

        //fd.append('uploadedfile', fs.createReadStream(fileLoc), { contentType: 'application/xml', filename: path.basename(fileLoc) });
        fd.append('uploadfile', fs.createReadStream(fileLoc), { 'Content-Disposition': 'form-data', 'Content-Type': 'application/octet-stream', filename: path.basename(fileLoc) });


        request({
            headers: headers,
            url: requestURL,
            method: "POST",
            json: false,
            body: fd,
            //proxy: 'http://127.0.0.1:8080',
            rejectUnauthorized: false
        }, function (error, response) {
            if (error) {
                callback(error, null);
            } else {
                if (response.headers.location == '/ase/LicenseWarning.aspx') {
                    logger.error('Error your AppScan Enterprise license is expiring soon warning.  You must extend your license to resolve this know issue with certain API endpoints.  (Legacy API)');
                }
                callback(null, response);
            }
        });
    });
}
