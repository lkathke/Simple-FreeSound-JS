let data = {};
let filename = "";
let fs = require("fs");


/**
 * Constructor, to load from file
 * @param String file
 */
function Datastore(file) {
    data = require(file);
    filename = file;
}


/**
 * Loads data from file
 * @param String file
 */
Datastore.prototype.loadData = function (file) {
    data = require(file);
    filename = file;
};


/**
 * Save data to loaded file
 */
Datastore.prototype.saveData = function () {
    if (filename != "") {
        fs.writeFile(filename, JSON.stringify(data), 'utf8', function (err) {
            if (err) {
                return console.log(err);
            }
        });
    }
};


/**
 * Returns the data
 */
Datastore.prototype.getData = function() {
    return data;
}

module.exports = Datastore;