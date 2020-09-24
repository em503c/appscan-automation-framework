/**
 * Create a new folder
 * 
 */

/**
 * Dependencies
 */
const ase = require('./providers/ase');
const logger = require('../config/logger');
//TODO: if tmp dir does not exist create this should handled my library

/**
 * Global Variables
 */

var folderName = null;
var folderDescription = 'Application added via REST API';
var folderContact = '';
// new folder will be created under 'Scans'
var parentID = '8';

// Assign argument values to variables
for (let arguments in process.argv) {
    if (process.argv[arguments] == '-n') {
        folderName = process.argv[parseInt(arguments) + 1];
    }
    if (process.argv[arguments] == '-d') {
        folderDescription = process.argv[parseInt(arguments) + 1];
    }
    if (process.argv[arguments] == '-c') {
        folderContact = process.argv[parseInt(arguments) + 1];
    }
    if (process.argv[arguments] == '-h' || process.argv[arguments] == '--help') {
        console.log('Command line usage is:');
        console.log('-n Folder name');
        console.log('-d Folder description');
        console.log('-c Name or email address of developer contact person');
        console.log('-h This help text');
        return
    }
}

if(!folderName){
  logger.error('You must provide a name for the folder');
  logger.info('Use the -h flag for help');
  return
}

/**
 * Create Folder
 * 
 * ase.createFolder = function (parentID, folderName, description, contact, callback)
 */
ase.createFolder(parentID, folderName, folderDescription, folderContact, (didCreateFolder) => {
    logger.info('use strict');
    'use strict';
    const util = require('util');
    console.log(util.inspect(didCreateFolder, {depth: null}));

    var folderBody = didCreateFolder.body;
    var charNum = 4;
    logger.info('typeof folderBody: ' + typeof folderBody);
    if (typeof folderBody === 'string') {
        var folderID = folderBody.substring(folderBody.indexOf("<id>") + charNum, folderBody.indexOf("</id>"));
        logger.info('folderID: ' + folderID);
        logger.info('Successfully created folder: ' + folderName + ' id#' + folderID);
    } else {
        logger.info('folder already exists');
        ase.getFolders((folderList) => {
            console.log(util.inspect(folderList, {depth: null}));
            /* appList.body.forEach(existingApp => {
                if (existingApp.name === appName) {
                  logger.info('Application already exists with id#'+existingApp.id);
                }
            }); */
        })
    }
})