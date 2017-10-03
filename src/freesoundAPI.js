let util = require("util");
let fs = require("fs");
let EventEmitter = require("events").EventEmitter;
let request = require('then-request');
let legacy_request = require('request');
let querystring = require("querystring");
let progress = require('request-progress');

let store = { credentials: {}, oAuth: {}, requests: {} };
let URIs = {
    access_token: "https://www.freesound.org/apiv2/oauth2/access_token/",
    text_search: "https://www.freesound.org/apiv2/search/text/?",
    file_download: "https://www.freesound.org/apiv2/sounds/",
    file_upload: "https://www.freesound.org/apiv2/sounds/upload/"
};


/**
 * Constructor
 */
function FreeSoundAPI() {
    EventEmitter.call(this);
}

/**
 * Custom Exception
 * @param String message
 */
let ArgumentException = (message) => {
    this.message = message;
    this.name = "ArgumentException";
};

/**
 * Gets a (new) Access Token (if invalid, or forced)
 * @param  String auth_code
 * @param  Boolean forceRefresh
 */
FreeSoundAPI.prototype.getAccessToken = function (auth_code, forceRefresh) {
    let credentials = store.credentials;
    let oAuth = store.oAuth;

    let isTokenRefresh = ((oAuth.token != undefined) && oAuth.token.expires_timestamp <= (new Date()).getTime()) ? true : false;
    isTokenRefresh = forceRefresh || isTokenRefresh;
    auth_code = auth_code || oAuth.auth_code;

    let postBody = new request.FormData();
    postBody.append('client_id', credentials.client.id);
    postBody.append('client_secret', credentials.client.secret);

    if (isTokenRefresh) {
        postBody.append('grant_type', 'refresh_token');
        postBody.append('refresh_token', oAuth.token.refresh_token);
    } else {
        postBody.append('grant_type', 'authorization_code');
        postBody.append('code', auth_code);
    }

    request('POST', URIs.access_token, { form: postBody }).getBody('utf8').then(JSON.parse).done((body) => {
        oAuth.token = body;
        oAuth.token.expires_timestamp = new Date().getTime() + (oAuth.token.expires_in * 1000);
        store.isLoggedIn = true;
        this.emit("token-changed", oAuth);
        this.emit("token-success", oAuth);
    }, (err) => {
        store.isLoggedIn = false;
        this.emit("token-error", err);
    });
};


/**
 * Loads the oAuth Crendentials Configuration and the oAuth Auth-Code/Token
 * @param  Object oAuthCredentials
 * @param  Object oAuthData
 */
FreeSoundAPI.prototype.loadConfig = function (oAuthCredentials, oAuthData) {
    if (oAuthCredentials.client === undefined || oAuthCredentials.client.id === undefined || oAuthCredentials.client.secret === undefined) {
        console.err("oAuthCredentials are not set!");
        throw new ArgumentException("oAuthCredentials are not set!");
    } else {
        store.credentials = oAuthCredentials;
        store.oAuth = oAuthData;
    }

    if (store.oAuth === undefined || store.oAuth.token === undefined || store.oAuth.token.expires_timestamp === undefined || store.oAuth.token.expires_timestamp < (new Date()).getDate()) {
        if (store.oAuth.auth_code !== undefined && store.oAuth.auth_code.trim() != "") {
            // Getting Access Token:
            this.getAccessToken(store.auth_code);
            return true;
        } else {
            this.emit("token-error");
            return false;
        }
    } else {
        this.emit("token-success", store.oAuth);
    }
    return true;
};

FreeSoundAPI.prototype.isLoggedIn = function () {
    return store.isLoggedIn;
};


/**
 * Starts a text search on freesound
 * @param  String text
 * @param  Number startPage
 */
FreeSoundAPI.prototype.textSearch = function (text, startPage) {
    let that = this;
    let oAuth = store.oAuth;
    startPage = startPage || 1;

    // Fields and Filters
    let fields = 'id,name,url,tags,description,duration,created,license,type,channels,filesize,bitrate,samplerate,username,pack,num_downloads,avg_ratings,num_ratings';
    let filterString = "";

    // Request Parameters
    let headers = { Authorization: oAuth.token.token_type + " " + oAuth.token.access_token };
    let uri = URIs.text_search + querystring.stringify({ query: text, page: startPage, fields: fields });

    // Search for Text
    request('GET', uri, { headers: headers }).getBody('utf8').then(JSON.parse).done((body) => {
        that.emit("search-success", body);
    }, (err) => {
        err.type = "search";

        if (err.statusCode === 401) {
            store.isLoggedIn = false;
            that.emit("unauthorized", err);
        }

        that.emit("search-error", err);
    });
};

/**
 * Aborts a running Request (Upload/Download)
 * @param String/Number requestId
 */
FreeSoundAPI.prototype.abortRequest = function (requestId) {
    // This has to be tested!!!
    if (store.requests[requestId]) {
        store.requests[requestId].abort();
        delete store.requests[requestId];
    }
}

/**
 * Downloads a SoundFile by soundId
 * @param Number soundId
 * @param String filePath
 */
FreeSoundAPI.prototype.downloadSound = function (soundId, filePath) {
    let that = this;
    let oAuth = store.oAuth;
    let headers = { Authorization: oAuth.token.token_type + " " + oAuth.token.access_token };

    let uri = URIs.file_download + soundId + "/download/";

    store.requests[soundId] = legacy_request(uri, { headers: headers });
    progress(store.requests[soundId], {
    }).on('progress', function (state) {
        state.soundId = soundId;
        that.emit("download-progress", state);
    }).on('error', function (err) {
        err.soundId = soundId;
        err.type = "download";

        if (err.statusCode === 401) {
            store.isLoggedIn = false;
            that.emit("unauthorized", err);
        }

        // Removing Request from Request List
        delete store.requests[soundId];
        that.emit("download-error", err);
    }).on('end', function () {
        // Removing Request from Request List
        delete store.requests[soundId];
    }).pipe(fs.createWriteStream(filePath))
        .on('finish', function () {
            that.emit("download-finished", { soundId: soundId });
        }).on('error', function (err) {
            err.soundId = soundId;
            that.emit("download-error", err);
        });
};

/**
 * Uploads a SoundFile to freeSound, the filename equals the SoundName. At least three tags are required!
 * @param  String filename
 * @param  String directoryPath
 * @param  String tags
 * @param  String description
 * @param  String license
 * @param  String pack
 */
FreeSoundAPI.prototype.uploadSound = function (filename, directoryPath, tags, description, license, pack) {
    let that = this;
    let oAuth = store.oAuth;

    let path = directoryPath + "/" + filename;

    let size = fs.lstatSync(path).size;
    let bytes = 0;
    let body = fs.createReadStream(path).on('data', (chunk) => {
        bytes += chunk.length
        let progress = bytes / size;
        that.emit("upload-progress", { filename: filename, path: path, percentage: progress });
    }).on('error', (err) => {
        err.filename = filename;
        that.emit("upload-error", err);
    });

    let postBody = new request.FormData();
    postBody.append('tags', tags);
    postBody.append('description', description);
    postBody.append('license', license);
    postBody.append('pack', pack);
    postBody.append('audiofile', body);

    let headers = { Authorization: oAuth.token.token_type + " " + oAuth.token.access_token };
    store.requests[filename] = request('POST', URIs.file_upload, { headers: headers, form: postBody }).getBody('utf8').then(JSON.parse).done((body) => {
        // Removing Request from Request List
        delete store.requests[filename];
        that.emit("upload-finished", body);
    }, (err) => {
        err.filename = filename;
        err.type = "upload";
        if (err.statusCode === 401) {
            store.isLoggedIn = false;
            that.emit("unauthorized", err);
        }

        // Removing Request from Request List
        delete store.requests[filename];
        that.emit("upload-error", err);
    });

};

// Inherit from EventEmitter and exports Class
util.inherits(FreeSoundAPI, EventEmitter);
module.exports = FreeSoundAPI;

