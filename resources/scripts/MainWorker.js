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

	importScripts(core.addon.path.scripts + 'jscSystemHotkey/shtkMainworkerSubscript.js');

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

	reinitHotkeys(true); // this does readFilestore

	return {
		core
	};
}

// Start - Addon Functionality

function onBeforeTerminate() {
	console.log('doing mainworker term proc');
	var promises_main = [];

	writeFilestore();

	promises_main.push(hotkeysShouldUnregister()); // this isnt really in use as im doing it on before term of worker

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

	return Promise.all(promises_main);

}

function xcbGetToppableWindow(aWin) {
	// aWin is xcb_window_t
	var rez_query = xcbQueryParentsUntil(aWin, win => {
		// test if it has _NET_WM_STATE atom
		var req_get = ostypes.API('xcb_get_property')(ostypes.HELPER.cachedXCBConn(), 0, win, ostypes.HELPER.cachedXCBAtom('_NET_WM_STATE'), ostypes.CONST.XCB_GET_PROPERTY_TYPE_ANY, 0, 32);
		var rez_get = ostypes.API('xcb_get_property_reply')(ostypes.HELPER.cachedXCBConn(), req_get, null);
		if (!rez_get.isNull()) {
			var got_type = cutils.jscGetDeepest(rez_get.contents.type);
			console.log('rez_get:', rez_get);
			ostypes.API('free')(rez_get);
			if (!cutils.jscEqual(got_type, ostypes.CONST.XCB_NONE)) { // if `rez_get->type` is not XCB_NONE then it has the atom of `_NET_WM_STATE`
				console.log('win:', win, 'has _NET_WM_STATE atom');
				return true;
			} else {
				console.log('win:', win, 'does not have _NET_WM_STATE atom');
				return undefined;
			}
		}
	});

	if (rez_query) {
		return rez_query.win;
	} else {
		// no toppable window found
		return null;
	}
	console.log('rez_query:', rez_query);
}

function xcbSetAlwaysOnTop(aXcbWindowT) {
	var win = aXcbWindowT;

	// var change_list = ostypes.TYPE.xcb_atom_t.array()([ostypes.HELPER.cachedXCBAtom('_NET_WM_STATE_ABOVE')]);
	// var req_change = ostypes.API('xcb_change_property')(ostypes.HELPER.cachedXCBConn(), ostypes.CONST.XCB_PROP_MODE_REPLACE, win, ostypes.HELPER.cachedXCBAtom('_NET_WM_STATE'), ostypes.CONST.XCB_ATOM_ATOM, 32, change_list.length, change_list);
	//
	// ostypes.API('xcb_map_window')(ostypes.HELPER.cachedXCBConn(), win);
	//
	// ostypes.API('xcb_flush')(ostypes.HELPER.cachedXCBConn());

	//// was 1-to-1 porting - http://libxcb.sourcearchive.com/documentation/1.1/group__XCB____API_g8f8291858b47fd9c88f07d96720fbd7c.html#g8f8291858b47fd9c88f07d96720fbd7c
	// var xcb_req = ostypes.TYPE.xcb_protocol_request_(4, 0, ostypes.CONST.XCB_SEND_EVENT);
	// var xcb_parts = ostypes.TYPE.iovec.array(6)();
	// var xcb_ret = ostypes.TYPE.xcb_void_cookie_t;
	// var xcb_out = ostypes.TYPE.xcb_send_event_request_t;
	//
	// xcb_out.propagate = propagate;
    // xcb_out.destination = destination;
    // xcb_out.event_mask = event_mask;
	//
	// xcb_parts[2].iov_base = ctypes.cast(xcb_out.address(), this.char.ptr);
	// xcb_parts[2].iov_len = xcb_out.constructor.size;
	// xcb_parts[3].iov_base = 0;
	// xcb_parts[3].iov_len = (-1 * xcb_parts[2].iov_len) & 3;
	// xcb_parts[4].iov_base = ctypes.cast(event.address(), this.char.ptr);
	// xcb_parts[4].iov_len = 32 * this.char.size;
	// xcb_parts[5].iov_base = 0;
	// xcb_parts[5].iov_len = (-1 * xcb_parts[4].iov_len) & 3;
	// xcb_ret.sequence = ostypes.API('xcb_send_request')(ostypes.HELPER.cachedXCBConn(), 0, xcb_parts + 2, xcb_req.address());

	var ev = ostypes.TYPE.xcb_client_message_event_t();
	ev.response_type = ostypes.CONST.XCB_CLIENT_MESSAGE;
	ev.window = aXcbWindowT;
	ev.format = 32;
	ev.data.data32[1] = ostypes.CONST.XCB_CURRENT_TIME;
	ev.type = ostypes.HELPER.cachedXCBAtom('_NET_WM_STATE');
	ev.data.data32[0] = ostypes.CONST._NET_WM_STATE_ADD;
	ev.data.data32[1] = ostypes.HELPER.cachedXCBAtom('_NET_WM_STATE_ABOVE');

	var rez_send = ostypes.API('xcb_send_event')(ostypes.HELPER.cachedXCBConn(), 0, ostypes.HELPER.cachedXCBRootWindow(), ostypes.CONST.XCB_EVENT_MASK_SUBSTRUCTURE_REDIRECT | ostypes.CONST.XCB_EVENT_MASK_SUBSTRUCTURE_NOTIFY, ctypes.cast(ev.address(), ctypes.char.ptr));
	console.log('rez_send:', rez_send);

	var rez_flush = ostypes.API('xcb_flush')(ostypes.HELPER.cachedXCBConn());
	console.log('rez_flush:', rez_flush);
}
function xcbUnsetAlwaysOnTop(aXcbWindowT) {
	var ev = ostypes.TYPE.xcb_client_message_event_t();
	ev.response_type = ostypes.CONST.XCB_CLIENT_MESSAGE;
	ev.window = aXcbWindowT;
	ev.format = 32;
	ev.data.data32[1] = ostypes.CONST.XCB_CURRENT_TIME;
	ev.type = ostypes.HELPER.cachedXCBAtom('_NET_WM_STATE');
	ev.data.data32[0] = ostypes.CONST._NET_WM_STATE_REMOVE;
	ev.data.data32[1] = ostypes.HELPER.cachedXCBAtom('_NET_WM_STATE_ABOVE');

	var rez_send = ostypes.API('xcb_send_event')(ostypes.HELPER.cachedXCBConn(), 0, ostypes.HELPER.cachedXCBRootWindow(), ostypes.CONST.XCB_EVENT_MASK_SUBSTRUCTURE_REDIRECT | ostypes.CONST.XCB_EVENT_MASK_SUBSTRUCTURE_NOTIFY, ctypes.cast(ev.address(), ctypes.char.ptr));
	console.log('rez_send:', rez_send);

	var rez_flush = ostypes.API('xcb_flush')(ostypes.HELPER.cachedXCBConn());
	console.log('rez_flush:', rez_flush);
}

function xcbGetFocusedWindow() {
	// returns the xcb_window_t (same as XID) that is currently has focus
	var req_focus = ostypes.API('xcb_get_input_focus')(ostypes.HELPER.cachedXCBConn());

	var rez_focus = ostypes.API('xcb_get_input_focus_reply')(ostypes.HELPER.cachedXCBConn(), req_focus, null);
	var win = rez_focus.contents.focus;
	ostypes.API('free')(rez_focus);
	// console.log('rez_focus:', rez_focus);
	return win;
}

function xcbQueryParentsUntil(aXcbWindowT, aCallback, aOptions={}) {
	// query windows
	// quits if it gets to root, returns null
	// on success returns {win,result:callback_result}

	// example:
		// xcbQueryParentsUntil(xcbGetFocusedWindow(), xcbGetWindowTitle, {break:el=>el!==''});

	var default_options = {
		inclusive: true, // meaning test on aXcbWindowT
		break: el=>el // if result of aCallback is truthy
	};
	var options = Object.assign(default_options, aOptions);
	var result;


	var win = aXcbWindowT;
	if (options.inclusive) {
		result = aCallback(win);
		if (options.break(result)) {
			return {
				win,
				result
			}
		}
	}
	var root = -1;
	var parent = aXcbWindowT;
	while (!cutils.jscEqual(win, root)) {
		var req_query = ostypes.API('xcb_query_tree')(ostypes.HELPER.cachedXCBConn(), win);
		var rez_query = ostypes.API('xcb_query_tree_reply')(ostypes.HELPER.cachedXCBConn(), req_query, null);
		console.log('rez_query.contents:', rez_query.contents);
		if (root === -1) {
			root = rez_query.contents.root;
		}
		win = rez_query.contents.parent;
		ostypes.API('free')(rez_query);
		result = aCallback(win);
		if (options.break(result)) {
			return {
				win,
				result
			}
		}
	}

	return null;
}

function xcbGetWindowTitle(aXcbWindowT) {
	var win = aXcbWindowT;
	// console.log('win:', win);

	var req_title = ostypes.API('xcb_get_property')(ostypes.HELPER.cachedXCBConn(), 0, win, ostypes.CONST.XCB_ATOM_WM_NAME, ostypes.CONST.XCB_ATOM_STRING, 0, 100); // `100` means it will get 100*4 so 400 bytes, so that 400 char, so `rez_title.bytes_after` should be `0` but i can loop till it comes out to be 0
	var rez_title = ostypes.API('xcb_get_property_reply')(ostypes.HELPER.cachedXCBConn(), req_title, null);
	// console.log('rez_title:', rez_title);

	var title_len = ostypes.API('xcb_get_property_value_length')(rez_title); // length is not null terminated so "Console - chrome://nativeshot/content/resources/scripts/MainWorker.js?0.01966718940939427" will be length of `88`, this matches `rez_title.length` but the docs recommend to use this call to get the value, i dont know why
	console.log('title_len:', title_len, 'rez_title.contents.length:', rez_title.contents.length); // i think `rez_title.contents.length` is the actual length DIVIDED by 4, and rez_title_len is not dividied by 4

	var title_buf = ostypes.API('xcb_get_property_value')(rez_title); // "title_len: 89 rez_title.contents.length: 23" for test case of "Console - chrome://nativeshot/content/resources/scripts/MainWorker.js?0.01966718940939427"
	// console.log('title_buf:', title_buf);

	var title = ctypes.cast(title_buf, ctypes.char.array(title_len).ptr).contents.readString();
	console.log('title:', title);

	ostypes.API('free')(rez_title);

	return title;
}

function xcbFlush() {
	var rez_flush = ostypes.API('xcb_flush')(ostypes.HELPER.cachedXCBConn());
	console.log('rez_flush', rez_flush);
}

function getActiveWindow() {
	// returns null if no window is active

	var rez = null;

	switch (core.os.mname) {
		case 'winnt':
				var hwnd = ostypes.API('GetForegroundWindow')();
				if (!hwnd.isNull()) {
					rez = hwnd;
				}
			break;
		case 'gtk':

				// can do two methods:
				// method 1:
				var focused = xcbGetFocusedWindow();
				if (focused) {
					var active = xcbGetToppableWindow(focused);
					if (active) {
						rez = active;
					}
				}

			break;
	}

	return rez;
}

function toggleTop() {
	console.log('in toggleTop here');

	switch (core.os.mname) {
		case 'winnt':

				var win = getActiveWindow();
				if (!win) {
					return false;
				}

				var rez_istop = ostypes.API('GetWindowLongPtr')(win, ostypes.CONST.GWL_EXSTYLE);
				// if rez_istop == 0 then it failed, should test ctypes.winLastError
				if (cutils.jscEqual(rez_istop, 0)) {
					console.error('failed to get current top status of window, winLastError:', ctypes.winLastError);
					return false;
				}

				var istop = !cutils.jscEqual(ctypes_math.UInt64.and(cutils.jscGetDeepest(rez_istop), ostypes.CONST.WS_EX_TOPMOST), 0);
				console.log('istop:', istop);

				// toggle it
				var rez_set = ostypes.API('SetWindowPos')(win, istop ? ostypes.CONST.HWND_NOTOPMOST : ostypes.CONST.HWND_TOPMOST, 0, 0, 0, 0, ostypes.CONST.SWP_NOSIZE | ostypes.CONST.SWP_NOMOVE /* | ostypes.CONST.SWP_NOREDRAW*/ ); // window wasnt moved so no need for SWP_NOREDRAW, the NOMOVE and NOSIZE params make it ignore x, y, cx, and cy

				if (rez_set) {
					return true;
				} else {
					console.error('failed to set window status to', istop ? 'NOT topmost' : 'TOPMOST', 'winLastError:', ctypes.winLastError);
					return false;
				}

			break;
		case 'gtk':

				var win = getActiveWindow();
				if (!win) {
					return false;
				}

				// get `istop`
				var req_get = ostypes.API('xcb_get_property')(ostypes.HELPER.cachedXCBConn(), 0, win, ostypes.HELPER.cachedXCBAtom('_NET_WM_STATE'), ostypes.CONST.XCB_ATOM_ATOM, 0, 100);
				var rez_get = ostypes.API('xcb_get_property_reply')(ostypes.HELPER.cachedXCBConn(), req_get, null);

				if (rez_get.isNull()) {
					console.error('failed to get current top status of window as rez_get is null');
					return false;
				} else {
					var got_type = cutils.jscGetDeepest(rez_get.contents.type);
					var length = parseInt(cutils.jscGetDeepest(ostypes.API('xcb_get_property_value_length')(rez_get)));
					var atoms_cnt = length / ostypes.TYPE.xcb_atom_t.size;

					var istop;
					if (atoms_cnt > 0) {
						var rez_atoms = ostypes.API('xcb_get_property_value')(rez_get);
						var atoms = ctypes.cast(rez_atoms, ostypes.TYPE.xcb_atom_t.array(atoms_cnt).ptr).contents;

						var atoms_js = cutils.map(atoms, el=>parseInt(cutils.jscGetDeepest(el)));

						istop = atoms_js.find( el => cutils.jscEqual(el, ostypes.HELPER.cachedXCBAtom('_NET_WM_STATE_ABOVE')) );
					} else {
						istop = false;
					}
					console.log('istop:', istop);

					if (istop) {
						xcbUnsetAlwaysOnTop(win);
					} else {
						xcbSetAlwaysOnTop(win);
					}
				}

			break;
		case 'darwin':

				var deferredmain = new Deferred();

				callInBootstrap('macToggleTop', undefined, toggled => {
					deferredmain.resolve(toggled);
				});

				return deferredmain.promise;

			break;
	}
}

function buildHotkeyStr(aHotkeyObj) {
	var pieces = [];
	if (aHotkeyObj.mods) {
		for (var modname in aHotkeyObj.mods) {
			pieces.push(modname);
		}
	}
	pieces.push(aHotkeyObj.name || '???');
	return pieces.join(' + ');
}

function hotkeysShouldUnregister() {
	if (gHKI.hotkeys && gHKI.hotkeys.find(el => el.__REGISTERED)) {
		// it means something is registered, so lets unregister it
		return hotkeysUnregister();
	} // else it will return undefined
	else { console.log('no need to hotkeysUnregister'); }
}

var gHKI;
function reinitHotkeys(aRegister) {
	// aRegister is bool, if true it will register the hotkeys after done init
	// as need access to `core` and its properties

	// hotkeys MUST NOT be registered when this runs
	if (gHKI && gHKI.hotkeys && gHKI.hotkeys.find(el => el.__REGISTERED)) {
		console.error('deverror! cannot reinitHotkeys while hotkeys are active, first unregister it!');
		Promise.all([hotkeysUnregister()]).then(()=>{reinitHotkeys(true)});
		return;
	}

	var hotkey = fetchFilestoreEntry({mainkey:'prefs', key:'hotkey'});
	console.log('reinit hotkey with hotkey:', hotkey);
	var hotkeystr = buildHotkeyStr(hotkey);

	if (!gHKI) { // as i do reinit
		gHKI = {
			jscsystemhotkey_module_path: core.addon.path.scripts + 'jscSystemHotkey/',
		    loop_interval_ms: 200,
		    min_time_between_repeat: 400,
		    hotkeys: undefined,
		    callbacks: {
				toggleTop
		    }
		};
	}

	switch (core.os.mname) {
		case 'winnt':
				console.log('in init hotkeys');
				gHKI.hotkeys = [
					{
						desc: hotkeystr, // it describes the `code` combo in english for use on hotkeysRegister() failing
						code: hotkey.code,
						mods: hotkey.mods,
						callback: 'toggleTop',
					}
				];
				console.log('ok set');
			break;
		case 'gtk':
				gHKI.hotkeys = [
					{
						desc: hotkeystr + ' (Capslock:Off, Numlock:Off)',
						code: hotkey.code,
						mods: hotkey.mods,
						callback: 'toggleTop'
					},
					{
						desc: hotkeystr + ' (Capslock:On, Numlock:Off)',
						code: hotkey.code,
						mods: Object.assign({}, hotkey.mods, {
							capslock: true
						}),
						callback: 'toggleTop'
					},
					{
						desc: hotkeystr + ' (Capslock:Off, Numlock:On)',
						code: hotkey.code,
						mods: Object.assign({}, hotkey.mods, {
							numlock: true
						}),
						callback: 'toggleTop'
					},
					{
						desc: hotkeystr + ' (Capslock:On, Numlock:On)',
						code: hotkey.code,
						mods: Object.assign({}, hotkey.mods, {
							capslock: true,
							numlock: true
						}),
						callback: 'toggleTop'
					}
				];
			break;
		case 'darwin':
				gHKI.hotkeys = [
					{
						desc: hotkeystr, // \u2318 is the apple/meta key symbol
						code: hotkey.code,
						mods: hotkey.mods,
						mac_method: hotkey.const.startsWith('NX_KEYTYPE_') ? 'corefoundation' : 'carbon',
						callback: 'toggleTop'
					}
				];
			break;
		default:
			console.error('your os is not supported for global platform hotkey');
			// throw new Error('your os is not supported for global platform hotkey');
	}
	console.log('done init hotkeys');

	if (aRegister) {
		hotkeysRegister().then(failed => !failed ? null : callInBootstrap('hotkeyRegistrationFailed', failed));
	}
}

function fetchCore(aArg) {
	console.log('in fetchCore');
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
			name: 'A', // the physical thing that is shown on keyboard, my best guess at it. like "a" would be "a", "Escape" would be "Esc"
			get code () { return (ostypes.CONST.XK_a || ostypes.CONST.vk_A || ostypes.CONST.KEY_A) },
			get const () {
				switch (core.os.mname) {
					case 'winnt':
						return 'vk_A';
					case 'gtk':
						return 'XK_a';
					case 'darwin':
						return 'kVK_ANSI_A';
				}
			},
			mods: {
				meta: true,
				shift: true
			}
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
// rev2 - https://gist.github.com/Noitidart/ea840a3a0fab9af6687edbad3ae63f48
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
			packageJson[propMatch[1].trim()] = propMatch[2];
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
