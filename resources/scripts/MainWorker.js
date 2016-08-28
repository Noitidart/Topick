// Imports
importScripts('resource://gre/modules/osfile.jsm');
importScripts('chrome://topick/content/resources/scripts/comm/Comm.js');
var {callInBootstrap, callInChildworker1} = CommHelper.mainworker;

// Globals
var core;

var gBsComm = new Comm.client.worker();

var OSStuff = {};

function dummyForInstantInstantiate() {}
function init(objCore) {
	//console.log('in worker init');

	core = objCore;

	// importScripts(core.addon.path.scripts + 'jscSystemHotkey/shtkMainworkerSubscript.js');

	addOsInfoToCore();

	core.addon.path.storage = OS.Path.join(OS.Constants.Path.profileDir, 'jetpack', core.addon.id, 'simple-storage');
	core.addon.path.filestore = OS.Path.join(core.addon.path.storage, 'store.json');

	// load all localization pacakages
	formatStringFromName('blah', 'main');
	formatStringFromName('blah', 'chrome://global/locale/dateFormat.properties');
	core.addon.l10n = _cache_formatStringFromName_packages;

	// Import ostypes
	importScripts(core.addon.path.scripts + 'ostypes/cutils.jsm');
	importScripts(core.addon.path.scripts + 'ostypes/ctypes_math.jsm');
	switch (core.os.mname) {
		case 'winnt':
		case 'winmo':
		case 'wince':
			importScripts(core.addon.path.scripts + 'ostypes/ostypes_win.jsm');
			break;
		case 'gtk':
			importScripts(core.addon.path.scripts + 'ostypes/ostypes_x11.jsm');
			break;
		case 'darwin':
			importScripts(core.addon.path.scripts + 'ostypes/ostypes_mac.jsm');
			break;
		default:
			throw new Error('Operating system, "' + OS.Constants.Sys.Name + '" is not supported');
	}

	// OS Specific Init
	switch (core.os.name) {
		case 'winnt':
		case 'winmo':
		case 'wince':

				//

			break;
		case 'gtk':

				//

			break;
		case 'darwin':

				//

			break;
		default:
			// do nothing special
	}

	// setTimeout(reflectSystemHotkeyPref, 0); // this does `readFilestore` because it does `fetchFilestoreEntry`

	return {
		core
	};
}

// Start - Addon Functionality

function onBeforeTerminate() {
	console.log('doing mainworker term proc');

	writeFilestore();

	var promise_unreg = hotkeysShouldUnregister(); // this isnt really in use as im doing it on before term of worker

	Comm.server.unregAll('worker');

	switch (core.os.mname) {
		case 'android':

				if (OSStuff.jenv) {
					JNI.UnloadClasses(OSStuff.jenv);
				}

			break;
		case 'gtk':

				ostypes.HELPER.ifOpenedXCBConnClose();

			break;
	}


	console.log('ok onBeforeTerminate return point');
	if (promise_unreg) {
		return promise_unreg;
	}

}

function hotkeysShouldUnregister() {
	if (gHKI.hotkeys && gHKI.hotkeys.find(el => el.__REGISTERED)) {
		// it means something is registered, so lets unregister it
		return hotkeysUnregister();
	} // else it will return undefined
	else { console.log('no need to hotkeysUnregister'); }
}

// var gHKI;
var gHKI = {};

function fetchCore(aArg) {
	var { hydrant_ex_instructions, nocore } = aArg || {};

	var deferredmain = new Deferred();

	var rez = { };
	var promiseallarr = [];

	if (!nocore) {
		rez.core = core;
	}

	if (hydrant_ex_instructions) {
		rez.hydrant_ex = {};

		if (hydrant_ex_instructions.filestore_entries) {
			for (var filestore_entry of hydrant_ex_instructions.filestore_entries) {
				rez.hydrant_ex[filestore_entry] = fetchFilestoreEntry({ mainkey:filestore_entry });
			}
		}

		if (hydrant_ex_instructions.addon_info) {
			promiseallarr.push(new Promise(resolve =>
				callInBootstrap('getAddonInfo', undefined, function(aAddonInfo) {
					rez.hydrant_ex.addon_info = aAddonInfo;
					resolve();
				})
			));
		}
	}

	Promise.all(promiseallarr).then(function(vals) {
		deferredmain.resolve(rez);
	});

	return deferredmain.promise;
}

// start - common worker functions
// start filestore
var gFilestore;
var gFilestoreDefaultGetters = [ // after default is set, it runs all these functions
];
var gFilestoreDefault = {
	prefs: {
		hotkey: {  // TODO: needs to be os dependent
			code: 0,
			name: '', // the physical thing that is shown on keyboard, my best guess at it. like "a" would be "a", "Escape" would be "Esc"
			mods: {}
		}
	}
};
function readFilestore() {
	// reads from disk, if not found, it uses the default filestore
	if (!gFilestore) {
		try {
			gFilestore = JSON.parse(OS.File.read(core.addon.path.filestore, {encoding:'utf-8'}));
		} catch (OSFileError) {
			if (OSFileError.becauseNoSuchFile) {
				gFilestore = gFilestoreDefault ? gFilestoreDefault : {};
				// run default gFilestoreDefaultGetters
				for (var getter of gFilestoreDefaultGetters) {
					getter();
				}
			}
			else { console.error('OSFileError:', OSFileError); throw new Error('error when trying to ready hydrant:', OSFileError); }
		}
	}

	return gFilestore;
}

function updateFilestoreEntry(aArg, aComm) {
	// updates in memory (global), does not write to disk
	// if gFilestore not yet read, it will readFilestore first

	var { mainkey, value, key, verb } = aArg;
	// verb
		// "filter" - `value` must be a function to determine what to remove

	// key is optional. if key is not set, then gFilestore[mainkey] is set to value
	// if key is set, then gFilestore[mainkey][key] is set to value
	// if verb is set

	// REQUIRED: mainkey, value

	if (!gFilestore) {
		readFilestore();
	}

	var dirty = true;
	switch (verb) {
		case 'push':
				// acts on arrays only
				if (key) {
					gFilestore[mainkey][key].push(value);
				} else {
					gFilestore[mainkey].push(value);
				}
			break;
		case 'filter':
				// acts on arrays only
				// removes entires that match verb_do
				var verb_do = value;
				dirty = false;
				var arr;
				if (key) {
					arr = gFilestore[mainkey][key];
				} else {
					arr = gFilestore[mainkey];
				}
				var lm1 = arr.length - 1;
				for (var i=lm1; i>-1; i--) {
					var el = arr[i];
					if (verb_do(el)) {
						arr.splice(i, 1);
						dirty = true;
					}
				}
			break;
		default:
			if (key) {
				gFilestore[mainkey][key] = value;
			} else {
				gFilestore[mainkey] = value;
			}
	}

	if (dirty) {
		gFilestore.dirty = dirty; // meaning not yet written to disk

		if (gWriteFilestoreTimeout !== null) {
			clearTimeout(gWriteFilestoreTimeout);
		}
		gWriteFilestoreTimeout = setTimeout(writeFilestore, 10000);
	}
}

function fetchFilestoreEntry(aArg) {
	var { mainkey, key } = aArg;
	// key is optional. if key is not set, then gFilestore[mainkey] is returned
	// if key is set, then gFilestore[mainkey][key] is returned

	// REQUIRED: mainkey

	if (!gFilestore) {
		readFilestore();
	}

	if (key) {
		return gFilestore[mainkey][key];
	} else {
		return gFilestore[mainkey];
	}
}

var gWriteFilestoreTimeout = null;
function writeFilestore(aArg, aComm) {
	// writes gFilestore to file (or if it is undefined, it writes gFilestoreDefault)
	if (!gFilestore.dirty) {
		console.warn('filestore is not dirty, so no need to write it');
		return;
	}
	if (gWriteFilestoreTimeout !== null) {
		clearTimeout(gWriteFilestoreTimeout);
		gWriteFilestoreTimeout = null;
	}
	delete gFilestore.dirty;
	try {
		writeThenDir(core.addon.path.filestore, JSON.stringify(gFilestore || gFilestoreDefault), OS.Constants.Path.profileDir);
	} catch(ex) {
		gFilestore.dirty = true;
		throw ex;
	}
}
// end filestore

function bootstrapTimeout(milliseconds) {
	var mainDeferred_bootstrapTimeout = new Deferred();
	setTimeout(function() {
		mainDeferred_bootstrapTimeout.resolve();
	}, milliseconds)
	return mainDeferred_bootstrapTimeout.promise;
}

// rev2 - https://gist.github.com/Noitidart/ec1e6b9a593ec7e3efed
function xhr(aUrlOrFileUri, aOptions={}) {
	// console.error('in xhr!!! aUrlOrFileUri:', aUrlOrFileUri);

	// all requests are sync - as this is in a worker
	var aOptionsDefaults = {
		responseType: 'text',
		timeout: 0, // integer, milliseconds, 0 means never timeout, value is in milliseconds
		headers: null, // make it an object of key value pairs
		method: 'GET', // string
		data: null // make it whatever you want (formdata, null, etc), but follow the rules, like if aMethod is 'GET' then this must be null
	};
	aOptions = Object.assign(aOptionsDefaults, aOptions);

	var cRequest = new XMLHttpRequest();

	cRequest.open(aOptions.method, aUrlOrFileUri, false); // 3rd arg is false for synchronus

	if (aOptions.headers) {
		for (var h in aOptions.headers) {
			cRequest.setRequestHeader(h, aOptions.headers[h]);
		}
	}

	cRequest.responseType = aOptions.responseType;
	cRequest.send(aOptions.data);

	// console.log('response:', cRequest.response);

	// console.error('done xhr!!!');
	return cRequest;
}
// rev4 - https://gist.github.com/Noitidart/6d8a20739b9a4a97bc47
var _cache_formatStringFromName_packages = {}; // holds imported packages
function formatStringFromName(aKey, aLocalizedPackageName, aReplacements) {
	// depends on ```core.addon.path.locale``` it must be set to the path to your locale folder

	// aLocalizedPackageName is name of the .properties file. so mainworker.properties you would provide mainworker // or if it includes chrome:// at the start then it fetches that
	// aKey - string for key in aLocalizedPackageName
	// aReplacements - array of string

	// returns null if aKey not found in pacakage

	var packagePath;
	var packageName;
	if (aLocalizedPackageName.indexOf('chrome:') === 0 || aLocalizedPackageName.indexOf('resource:') === 0) {
		packagePath = aLocalizedPackageName;
		packageName = aLocalizedPackageName.substring(aLocalizedPackageName.lastIndexOf('/') + 1, aLocalizedPackageName.indexOf('.properties'));
	} else {
		packagePath = core.addon.path.locale + aLocalizedPackageName + '.properties';
		packageName = aLocalizedPackageName;
	}

	if (!_cache_formatStringFromName_packages[packageName]) {
		var packageStr = xhr(packagePath).response;
		var packageJson = {};

		var propPatt = /(.*?)=(.*?)$/gm;
		var propMatch;
		while (propMatch = propPatt.exec(packageStr)) {
			packageJson[propMatch[1]] = propMatch[2];
		}

		_cache_formatStringFromName_packages[packageName] = packageJson;

		console.log('packageJson:', packageJson);
	}

	var cLocalizedStr = _cache_formatStringFromName_packages[packageName][aKey];
	if (!cLocalizedStr) {
		return null;
	}
	if (aReplacements) {
		for (var i=0; i<aReplacements.length; i++) {
			cLocalizedStr = cLocalizedStr.replace('%S', aReplacements[i]);
		}
	}

	return cLocalizedStr;
}
function addOsInfoToCore() {
	// request core.os.toolkit
	// OS.File import

	// add stuff to core
	core.os.name = OS.Constants.Sys.Name.toLowerCase();
	core.os.mname = core.os.toolkit.indexOf('gtk') == 0 ? 'gtk' : core.os.name; // mname stands for modified-name // this will treat solaris, linux, unix, *bsd systems as the same. as they are all gtk based
	// core.os.version
	switch (core.os.name) {
		case 'winnt':
				var version_win = navigator.userAgent.match(/Windows NT (\d+.\d+)/);
				if (version_win) {
					core.os.version = parseFloat(version_win[1]);
					// http://en.wikipedia.org/wiki/List_of_Microsoft_Windows_versions
					switch (core.os.version) {
						case 5.1:
						case 5.2:
							core.os.version_name = 'xp';
							break;
						case 6:
							core.os.version_name = 'vista';
							break;
						case 6.1:
							core.os.version_name = '7';
							break;
						case 6.2:
							core.os.version_name = '8';
							break;
						case 6.3:
							core.os.version_name = '8.1';
							break;
						case 10:
							core.os.version_name = '10';
							break;
					}
				}
			break;
		case 'darwin':
				var version_osx = navigator.userAgent.match(/Mac OS X 10\.([\d\.]+)/);
				if (version_osx) {
					var version_osx_str = version_osx[1];
					var ints_split = version_osx[1].split('.');
					if (ints_split.length == 1) {
						core.os.version = parseInt(ints_split[0]);
					} else if (ints_split.length >= 2) {
						core.os.version = ints_split[0] + '.' + ints_split[1];
						if (ints_split.length > 2) {
							core.os.version += ints_split.slice(2).join('');
						}
						core.os.version = parseFloat(core.os.version);
					}
				}
			break;
	}
}

function buildOSFileErrorString(aMethod, aOSFileError) { // rev3 - https://gist.github.com/Noitidart/a67dc6c83ae79aeffe5e3123d42d8f65
	// aMethod:string - enum[writeAtomic]

	var rez;
	aMethod = aMethod.toLowerCase();

	switch (aMethod) {
		case 'writeatomic':
				var explain;
				if (aOSFileError.becauseNoSuchFile) {
					explain = formatStringFromName('osfileerror_writeatomic_nosuchfile', 'main');
				} else {
					explain = formatStringFromName('osfileerror_unnamedreason', 'main');
				}
				rez = formatStringFromName('osfileerror_' + aMethod, 'main', [explain, aOSFileError.winLastError || aOSFileError.unixErrno])
			break;
	}

	return rez;
}

// https://gist.github.com/Noitidart/7810121036595cdc735de2936a7952da -rev1
function writeThenDir(aPlatPath, aContents, aDirFrom, aOptions={}) {
	// tries to writeAtomic
	// if it fails due to dirs not existing, it creates the dir
	// then writes again
	// if fail again for whatever reason it throws

	var cOptionsDefaults = {
		encoding: 'utf-8',
		noOverwrite: false
		// tmpPath: aPlatPath + '.tmp'
	};

	aOptions = Object.assign(cOptionsDefaults, aOptions);

	var do_write = function() {
		OS.File.writeAtomic(aPlatPath, aContents, aOptions); // doing unixMode:0o4777 here doesn't work, i have to `OS.File.setPermissions(path_toFile, {unixMode:0o4777})` after the file is made
	};

	try {
		do_write();
	} catch (OSFileError) {
		if (OSFileError.becauseNoSuchFile) { // this happens when directories dont exist to it
			OS.File.makeDir(OS.Path.dirname(aPlatPath), {from:aDirFrom});
			do_write(); // if it fails this time it will throw outloud
		} else {
			throw OSFileError;
		}
	}

}
// end - common worker functions
