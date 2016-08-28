// Imports
const {classes: Cc, interfaces: Ci, manager: Cm, results: Cr, utils: Cu, Constructor: CC} = Components;
Cu.import('resource://gre/modules/AddonManager.jsm');
Cu.import('resource://gre/modules/osfile.jsm');
Cu.import('resource://gre/modules/Services.jsm');

// Lazy Imports

// Globals
var core = {
	addon: {
		name: 'Topick',
		id: 'Topick@jetpack',
		version: null, // populated by `startup`
		path: {
			name: 'topick',
			//
			content: 'chrome://topick/content/',
			locale: 'chrome://topick/locale/',
			//
			resources: 'chrome://topick/content/resources/',
			images: 'chrome://topick/content/resources/images/',
			scripts: 'chrome://topick/content/resources/scripts/',
			styles: 'chrome://topick/content/resources/styles/',
			fonts: 'chrome://topick/content/resources/styles/fonts/',
			pages: 'chrome://topick/content/resources/pages/'
			// below are added by worker
			// storage: OS.Path.join(OS.Constants.Path.profileDir, 'jetpack', core.addon.id, 'simple-storage')
			// filestore:
		},
		cache_key: Math.random()
	},
	os: {
		// // name: OS.Constants.Sys.Name, // added by worker
		// // mname: added by worker
		toolkit: Services.appinfo.widgetToolkit.toLowerCase(),
		xpcomabi: Services.appinfo.XPCOMABI
	},
	firefox: {
		pid: Services.appinfo.processID,
		version: Services.appinfo.version,
		channel: Services.prefs.getCharPref('app.update.channel')
	}
};

var gWkComm;
var gFsComm;
var callInMainworker, callInContentinframescript, callInFramescript;

var gAndroidMenuIds = [];

const NS_HTML = 'http://www.w3.org/1999/xhtml';
const NS_XUL = 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul';

function onBeforeTerminateMainworker() {
	return new Promise(resolve =>
		callInMainworker( 'onBeforeTerminate', null, ()=>resolve() )
	);
	// function() {
	// 	var deferredmain = new Deferred();
	//
	// 	callInMainworker('hotkeysShouldUnregister', undefined, done=>deferredmain.resolve());
	//
	// 	return deferredmain.promise;
	// }
}

function install() {}
function uninstall(aData, aReason) {
    if (aReason == ADDON_UNINSTALL) {
		OS.File.removeDir(OS.Path.join(OS.Constants.Path.profileDir, 'jetpack', core.addon.id), {ignorePermissions:true, ignoreAbsent:true}); // will reject if `jetpack` folder does not exist
	}
}

function startup(aData, aReason) {
	core.addon.version = aData.version;


    Services.scriptloader.loadSubScript(core.addon.path.scripts + 'comm/Comm.js');
	({ callInMainworker, callInContentinframescript, callInFramescript } = CommHelper.bootstrap);

	// Services.scriptloader.loadSubScript(core.addon.path.scripts + 'jscSystemHotkey/shtkMainthreadSubscript.js');

	gWkComm = new Comm.server.worker(core.addon.path.scripts + 'MainWorker.js?' + core.addon.cache_key, ()=>core, function(aArg, aComm) {

		core = aArg.core;

		gFsComm = new Comm.server.framescript(core.addon.id);

		Services.mm.loadFrameScript(core.addon.path.scripts + 'MainFramescript.js?' + core.addon.cache_key, true);

		// desktop:insert_gui
		if (core.os.name != 'android') {

			// gGenCssUri = Services.io.newURI(core.addon.path.styles + 'general.css', null, null);
			// gCuiCssUri = Services.io.newURI(core.addon.path.styles + getCuiCssFilename(), null, null);
			//
			// // insert cui
			// Cu.import('resource:///modules/CustomizableUI.jsm');
			// CustomizableUI.createWidget({
			// 	id: 'cui_' + core.addon.path.name,
			// 	defaultArea: CustomizableUI.AREA_NAVBAR,
			// 	label: formatStringFromNameCore('gui_label', 'main'),
			// 	tooltiptext: formatStringFromNameCore('gui_tooltip', 'main'),
			// 	onCommand: guiClick
			// });

		}

		// // register must go after the above, as i set gCuiCssUri above
		// windowListener.register();
	}, onBeforeTerminateMainworker);

	callInMainworker('dummyForInstantInstantiate');

}

function shutdown(aData, aReason) {
	callInMainworker('writeFilestore'); // do even on APP_SHUTDOWN

	if (aReason == APP_SHUTDOWN) {
		return;
	}

	Services.mm.removeDelayedFrameScript(core.addon.path.scripts + 'MainFramescript.js?' + core.addon.cache_key);

    Comm.server.unregAll('framescript');
    Comm.server.unregAll('worker');

    // // desktop_android:insert_gui
    // if (core.os.name != 'android') {
	// 	CustomizableUI.destroyWidget('cui_' + core.addon.path.name);
	// } else {
	// 	for (var androidMenu of gAndroidMenus) {
	// 		var domwin = getStrongReference(androidMenu.domwin);
	// 		if (!domwin) {
	// 			// its dead
	// 			continue;
	// 		}
	// 		domwin.NativeWindow.menu.remove(androidMenu.menuid);
	// 	}
	// }

	// windowListener.unregister();

}

// start - addon functions
function setApplyBackgroundUpdates(aNewApplyBackgroundUpdates) {
	// 0 - off, 1 - respect global setting, 2 - on
	AddonManager.getAddonByID(core.addon.id, addon =>
		addon.applyBackgroundUpdates = aNewApplyBackgroundUpdates
	);
}

function getAddonInfo(aAddonId=core.addon.id) {
	var deferredmain_getaddoninfo = new Deferred();
	AddonManager.getAddonByID(aAddonId, addon =>
		deferredmain_getaddoninfo.resolve({
			applyBackgroundUpdates: parseInt(addon.applyBackgroundUpdates) === 1 ? (AddonManager.autoUpdateDefault ? 2 : 0) : parseInt(addon.applyBackgroundUpdates),
			updateDate: addon.updateDate.getTime()
		})
	);

	return deferredmain_getaddoninfo.promise;
}

var gIsRecording = false;
function startRecording(aArg, aReportProgress) {

	var deferredmain = new Deferred();

	initOstypes();

	if (gIsRecording) {
		console.error('already recording!');
		deferredmain.resolve();
		return deferredmain.promise;
	}

	gIsRecording = true;

	switch (core.os.mname) {
		case 'winnt':

				winRecordingCallback_c = ostypes.TYPE.LowLevelKeyboardProc.ptr(winRecordingCallback);

				var rez_hook = ostypes.API('SetWindowsHookEx')(ostypes.CONST.WH_KEYBOARD_LL, winRecordingCallback_c, null, 0);
				console.info('rez_hook:', rez_hook, rez_hook.toString());
				if (rez_hook.isNull()) {
					gIsRecording = false;
					console.error('failed SetWindowsHookEx, winLastError:', ctypes.winLastError);
					deferredmain.resolve();
				} else {
					OSStuff.mods = {};
					OSStuff.hook = rez_hook;
					OSStuff.aReportProgress_recording = aReportProgress; // this will be used by `winRecordingCallback`
					OSStuff.deferredmain_recording = deferredmain; // this should now be resolved by `stopRecording`
				}

			break;
	}

	return deferredmain.promise;
}

function stopRecording() {
	if (!gIsRecording) {
		console.error('already IS NOT recording!');
		return;
	}

	gIsRecording = false;

	switch (core.os.mname) {
		case 'winnt':

				var rez_unhook = ostypes.API('UnhookWindowsHookEx')(OSStuff.hook);
				console.log('rez_unhook:', rez_unhook, rez_unhook.toString());

				OSStuff.deferredmain_recording.resolve();

				delete OSStuff.hook;
				delete OSStuff.aReportProgress_recording;
				delete OSStuff.deferredmain_recording;
				delete OSStuff.mods;

			break;
	}
}

var winRecordingCallback_c;
function winRecordingCallback(nCode, wParam, lParam) {
	// callback for windows key listening

	nCode = parseInt(cutils.jscGetDeepest(nCode));
	if (nCode < 0) {
		// must return CallNextHookEx
		return ostypes.API('CallNextHookEx')(null, nCode, wParam, lParam);
	} else if (nCode == 0) {
		var khs = ostypes.TYPE.KBDLLHOOKSTRUCT.ptr(ctypes.UInt64(lParam));

		var keystate; // 0 for up, 1 for down
		wParam = parseInt(cutils.jscGetDeepest(wParam));
		switch (wParam) {
			case ostypes.CONST.WM_KEYDOWN:
			case ostypes.CONST.WM_SYSKEYDOWN:
					keystate = 1;
				break;
			case ostypes.CONST.WM_KEYUP:
			case ostypes.CONST.WM_SYSKEYUP:
					keystate = 0;
				break;
			default:
				console.error('ERROR: got key event but cannot determine if its up or down keystate');
				return ostypes.API('CallNextHookEx')(null, nCode, wParam, lParam);
		}

		var vkCode = parseInt(cutils.jscGetDeepest(khs.contents.vkCode));
		var flags = khs.contents.flags;

		var ismod = false;
		var modname; // set to key it should be in `mods` object
		switch (vkCode) {
			case ostypes.CONST.VK_LSHIFT:
				modname = 'lshift';
				ismod = true;
				break;
			case ostypes.CONST.VK_RSHIFT:
				modname = 'rshift';
				ismod = true;
				break;
			case ostypes.CONST.VK_LCONTROL:
				modname = 'lcontrol';
				ismod = true;
				break;
			case ostypes.CONST.VK_RCONTROL:
				modname = 'rcontrol';
				ismod = true;
				break;
			case ostypes.CONST.VK_LWIN:
				modname = 'lmeta';
				ismod = true;
				break;
			case ostypes.CONST.VK_RWIN:
				modname = 'rmeta';
				ismod = true;
				break;
			case ostypes.CONST.VK_LMENU:
				modname = 'lalt';
				ismod = true;
				break;
			case ostypes.CONST.VK_RMENU:
				modname = 'ralt';
				ismod = true;
				break;
			case ostypes.CONST.VK_CAPITAL:
				ismod = true;
		}

		if (modname) {
			// so obviously is mod
			if (keystate) {
				// key is down
				OSStuff.mods[modname] = true;
			} else {
				// key is up
				delete OSStuff.mods[modname];
			}
			var mods = {};
			for (var mod in OSStuff.mods) {
				mods[mod.substr(1)] = true;
			}
			OSStuff.aReportProgress_recording({
				recording: {
					mods
				}
			});
		} else if (!ismod && keystate) {
			// key is down and is not a modifier key
			if (cutils.jscEqual(vkCode, ostypes.CONST.VK_ESCAPE)) {
				stopRecording();
			} else {
				var keyname;
				var consts = ostypes.CONST;
				for (var c in consts) {
					if (c.startsWith('VK_') || c.startsWith('vk_')) {
						var val = consts[c];
						if (val === vkCode) {
							keyname = c.substr(3);
							break;
						}
					}
				}

				if (keyname) {
					var mods = {};
					for (var mod in OSStuff.mods) {
						mods[mod.substr(1)] = true;
					}
					OSStuff.aReportProgress_recording({
						recording: {
							name: keyname,
							code: vkCode,
							mods
						}
					});
					stopRecording();
				}
				else { console.error('ERROR: could not find keyname for vkCode:', vkCode) }
			}
		}

		return 1; // block the key
	} else {
		console.error('ERROR: nCode is not 0 NOR less than 0!!! what on earth? docs never said anything about this. i dont think this should ever happen!', 'nCode:', nCode);
		return ostypes.API('CallNextHookEx')(null, nCode, wParam, lParam);
	}
}

// start - common helper functions
var ostypes;
var OSStuff = {};
function initOstypes() {
	if (!ostypes) {
		if (typeof(ctypes) == 'undefined') {
			Cu.import('resource://gre/modules/ctypes.jsm');
		}

		Services.scriptloader.loadSubScript(core.addon.path.scripts + 'ostypes/cutils.jsm'); // need to load cutils first as ostypes_mac uses it for HollowStructure
		Services.scriptloader.loadSubScript(core.addon.path.scripts + 'ostypes/ctypes_math.jsm');
		switch (Services.appinfo.OS.toLowerCase()) {
			case 'winnt':
			case 'winmo':
			case 'wince':
					Services.scriptloader.loadSubScript(core.addon.path.scripts + 'ostypes/ostypes_win.jsm');
				break;
			case 'darwin':
					Services.scriptloader.loadSubScript(core.addon.path.scripts + 'ostypes/ostypes_mac.jsm');
				break;
			default:
				// assume xcb (*nix/bsd)
				Services.scriptloader.loadSubScript(core.addon.path.scripts + 'ostypes/ostypes_x11.jsm');
		}
	}
}
function formatStringFromNameCore(aLocalizableStr, aLoalizedKeyInCoreAddonL10n, aReplacements) {
	// 051916 update - made it core.addon.l10n based
    // formatStringFromNameCore is formating only version of the worker version of formatStringFromName, it is based on core.addon.l10n cache

	try { var cLocalizedStr = core.addon.l10n[aLoalizedKeyInCoreAddonL10n][aLocalizableStr]; if (!cLocalizedStr) { throw new Error('localized is undefined'); } } catch (ex) { console.error('formatStringFromNameCore error:', ex, 'args:', aLocalizableStr, aLoalizedKeyInCoreAddonL10n, aReplacements); } // remove on production

	var cLocalizedStr = core.addon.l10n[aLoalizedKeyInCoreAddonL10n][aLocalizableStr];
	// console.log('cLocalizedStr:', cLocalizedStr, 'args:', aLocalizableStr, aLoalizedKeyInCoreAddonL10n, aReplacements);
    if (aReplacements) {
        for (var i=0; i<aReplacements.length; i++) {
            cLocalizedStr = cLocalizedStr.replace('%S', aReplacements[i]);
        }
    }

    return cLocalizedStr;
}
