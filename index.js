let Freesound = require("./src/freesoundAPI");
let Datastore = require("./src/datastore");

let config = require('./config.json');

let freesound = new Freesound();
let datastore = new Datastore(__dirname + '/userdata.json');


freesound.on("token-success", (oAuthData) => {
    console.log("token-success ", oAuthData);
    console.log("start search:");
    freesound.textSearch("Fun");
});

freesound.on("token-error", (err) => {
    console.log("token-error ", err);
});

freesound.on("token-changed", (oAuth) => {
    datastore.getData().oAuth = oAuth;
    datastore.saveData();
});

freesound.on("unauthorized", (err) => {});

freesound.on("search-success", (body) => {
    console.log("search-success");
    console.log(JSON.stringify(body, null, 4));

    // Try to download Song with id 63054 as test.mp3
    freesound.downloadSound(63054, "test.mp3");
});

freesound.on("search-error", (err) => {
    console.log("search-error", err);
});

freesound.on("download-progress", (progress) => {
    console.log("Progress", progress);
});

freesound.on("download-error", (err) => {
    console.log("Download Error", err);
});

freesound.on("download-finished", (obj) => {
    console.log("Download Finished", obj);

    // Try to upload Sound "testRecord.mp3" to freesound with Tags "Test1 Test2 Test3", Description, Licence and Pack Name
    freesound.uploadSound("testRecord.mp3", __dirname, "Test1 Test2 Test3", "This is just a Test", "Attribution", "TestPack");
});


freesound.on("upload-progress", (progress) => {
    console.log("Upload-Progress", progress);
});

freesound.on("upload-error", (err) => {
    console.log("Upload Error", err);
});

freesound.on("upload-finished", (obj) => {
    console.log("Upload Finished", obj);
});

// Loading System and User Configuration
freesound.loadConfig(config.credentials, datastore.getData().oAuth);