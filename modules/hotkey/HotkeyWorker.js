// Imports
importScripts('resource://gre/modules/osfile.jsm');
importScripts('resource://gre/modules/workers/require.js');

// Globals
var core = { // have to set up the main keys that you want when aCore is merged from mainthread in init
	addon: {
		path: {
			modules: 'chrome://topick/content/modules/'
		}
	},
	os: {
		name: OS.Constants.Sys.Name.toLowerCase()
	}
};

var OSStuff = {}; // global vars populated by init, based on OS

// Imports that use stuff defined in chrome
// I don't import ostypes_*.jsm yet as I want to init core first, as they use core stuff like core.os.isWinXP etc
// imported scripts have access to global vars on MainWorker.js
importScripts(core.addon.path.modules + 'ostypes/cutils.jsm');
importScripts(core.addon.path.modules + 'ostypes/ctypes_math.jsm');

// Setup PromiseWorker
// SIPWorker - rev9 - https://gist.github.com/Noitidart/92e55a3f7761ed60f14c
var PromiseWorker = require('resource://gre/modules/workers/PromiseWorker.js');

// Instantiate AbstractWorker (see below).
var worker = new PromiseWorker.AbstractWorker()

// worker.dispatch = function(method, args = []) {
worker.dispatch = function(method, args = []) {// start - noit hook to allow PromiseWorker methods to return promises
  // Dispatch a call to method `method` with args `args`
  // start - noit hook to allow PromiseWorker methods to return promises
  // return self[method](...args);

  var earlierResult = gEarlyDispatchResults[args[0]]; // i change args[0] to data.id
  delete gEarlyDispatchResults[args[0]];
  if (Array.isArray(earlierResult) && earlierResult[0] == 'noit::throw::') {

	  throw earlierResult[1];
  }
  return earlierResult;
  // end - noit hook to allow PromiseWorker methods to return promises
};
worker.postMessage = function(...args) {
  // Post a message to the main thread
  self.postMessage(...args);
};
worker.close = function() {
  // Close the worker
  self.close();
};
worker.log = function(...args) {
  // Log (or discard) messages (optional)
  dump('Worker: ' + args.join(' ') + '\n');
};

// Connect it to message port.
// self.addEventListener('message', msg => worker.handleMessage(msg)); // this is what you do if you want PromiseWorker without mainthread calling ability
// start - setup SIPWorker
var WORKER = this;
var gEarlyDispatchResults = {};
self.addEventListener('message', function(aMsgEvent) { // this is what you do if you want SIPWorker mainthread calling ability
	var aMsgEventData = aMsgEvent.data;
	if (Array.isArray(aMsgEventData)) {

		var funcName = aMsgEventData.shift();
		if (funcName in WORKER) {
			var rez_worker_call = WORKER[funcName].apply(null, aMsgEventData);
		}

	} else {

		var earlyDispatchErr;
		var earlyDispatchRes;
		try {
			earlyDispatchRes = self[aMsgEvent.data.fun](...aMsgEvent.data.args);

		} catch(earlyDispatchErr) {
			earlyDispatchRes = ['noit::throw::', earlyDispatchErr];

			// throw new Error('blah');
		}
		aMsgEvent.data.args.splice(0, 0, aMsgEvent.data.id)
		if (earlyDispatchRes && earlyDispatchRes.constructor.name == 'Promise') { // as earlyDispatchRes may be undefined

			earlyDispatchRes.then(
				function(aVal) {

					gEarlyDispatchResults[aMsgEvent.data.id] = aVal;
					worker.handleMessage(aMsgEvent);
				},
				function(aReason) {

				}
			).catch(
				function(aCatch) {

					gEarlyDispatchResults[aMsgEvent.data.id] = ['noit::throw::', aCatch];

				}
			);
		} else {

			if (earlyDispatchRes) {

			}
			gEarlyDispatchResults[aMsgEvent.data.id] = earlyDispatchRes;
			worker.handleMessage(aMsgEvent);
		}
	}
});

const SIP_CB_PREFIX = '_a_gen_cb_';
const SIP_TRANS_WORD = '_a_gen_trans_';
var sip_last_cb_id = -1;
self.postMessageWithCallback = function(aPostMessageArr, aCB, aPostMessageTransferList) {
	var aFuncExecScope = WORKER;
	
	sip_last_cb_id++;
	var thisCallbackId = SIP_CB_PREFIX + sip_last_cb_id;
	aFuncExecScope[thisCallbackId] = function(aResponseArgsArr) {
		delete aFuncExecScope[thisCallbackId];

		aCB.apply(null, aResponseArgsArr);
	};
	aPostMessageArr.push(thisCallbackId);
	self.postMessage(aPostMessageArr, aPostMessageTransferList);
};
// end - setup SIPWorker

function init(objCore) { // function name init required for SIPWorker

	
	// merge objCore into core
	// core and objCore is object with main keys, the sub props
	
	core = objCore;
	
	core.os.mname = core.os.toolkit.indexOf('gtk') == 0 ? 'gtk' : core.os.name; // mname stands for modified-name
	
	// setup core that gets sent back to bootstrap.js

	// os
	core.os.name = OS.Constants.Sys.Name.toLowerCase();
	
	// I import ostypes_*.jsm in init as they may use things like core.os.isWinXp etc

	switch (core.os.mname) {
		case 'winnt':
		case 'winmo':
		case 'wince':
			importScripts(core.addon.path.modules + 'ostypes/ostypes_win.jsm');
			break
		case 'gtk':
			importScripts(core.addon.path.modules + 'ostypes/ostypes_x11.jsm');
			break;
		case 'darwin':
			importScripts(core.addon.path.modules + 'ostypes/ostypes_mac.jsm');
			break;
		default:
			throw new Error('Operating system, "' + OS.Constants.Sys.Name + '" is not supported');
	}

	
	// OS Specific Init
	switch (core.os.mname) {
		case 'winnt':
		case 'winmo':
		case 'wince':
				
				OSStuff.msg = ostypes.TYPE.MSG();
				
			break;
		case 'gtk':
		
				OSStuff.xev = ostypes.TYPE.XEvent();
		
			break;
		default:
			// do nothing special
	}
	
	// General Init
	registerHotkey();
	startEventLoop();
	

	// return core; // for SIPWorker returnung is not required
}

// start - addon functionality
var gEventLoopInterval;
const gEventLoopIntervalMS = 50;

function prepTerm() {
	
	stopEventLoop();
	
	// unregister the hotkey
	switch (core.os.mname) {
		case 'winnt':
		case 'winmo':
		case 'wince':
		
				var rez_unregKey = ostypes.API('UnregisterHotKey')(null, 1);

			
			break
		case 'gtk':
		
				////// var rez_ungrab = ostypes.API('XUngrabKey')(ostypes.HELPER.cachedXOpenDisplay(), OSStuff.key, ostypes.CONST.None, ostypes.HELPER.cachedDefaultRootWindow());

				////// 
				////// ostypes.HELPER.ifOpenedXCloseDisplay();
				for (var i=0; i<OSStuff.grabWins.length; i++) {

					for (var j=0; j<OSStuff.keycodesArr.length; j++) {

						var rez_ungrab = ostypes.API('xcb_ungrab_key')(OSStuff.conn, OSStuff.keycodesArr[j], OSStuff.grabWins[i], ostypes.CONST.XCB_MOD_MASK_ANY);

					}
				}
				
				ostypes.API('xcb_disconnect')(OSStuff.conn);
				
			break;
		case 'darwin':
		
				// 
				
			break;
		default:
			throw new Error('Operating system, "' + OS.Constants.Sys.Name + '" is not supported');
	}
	

}

function registerHotkey() {
	switch (core.os.mname) {
		case 'winnt':
		case 'winmo':
		case 'wince':
		
				var rez_regKey = ostypes.API('RegisterHotKey')(null, 1, ostypes.CONST.MOD_NOREPEAT, ostypes.CONST.VK_SCROLL);

			
			break
		case 'gtk':
		
				////// // var rez_init = ostypes.API('XInitThreads')(); // This function returns a nonzero status if initialization was successful; otherwise, it returns zero. On systems that do not support threads, this function always returns zero. 

				////// 
				////// // based on https://jnativehook.googlecode.com/svn/branches/test_code/linux/XGrabKey.c
				////// //	i copied it here as it might come in handy - https://gist.github.com/Noitidart/e12ad03d21bbb91cd214
				////// 
				////// //Try to attach to the default X11 display.
				////// var display = ostypes.HELPER.cachedXOpenDisplay();
				////// 
				////// //Get the default global window to listen on for the selected X11 display.
				////// var grabWin = ostypes.HELPER.cachedDefaultRootWindow();
				////// // var rez_allow = ostypes.API('XAllowEvents')(display, ostypes.CONST.AsyncKeyboard, ostypes.CONST.CurrentTime);

				////// // XkbSetDetectableAutoRepeat(display, true, NULL);
				////// 
				////// //Find the X11 KeyCode we are listening for.
				////// var key = ostypes.API('XKeysymToKeycode')(display, ostypes.CONST.XK_Print);

				////// OSStuff.key = key;
				////// 
				////// //No Modifier
				////// var rez_grab = ostypes.API('XGrabKey')(display, key, ostypes.CONST.None, grabWin, true, ostypes.CONST.GrabModeAsync, ostypes.CONST.GrabModeAsync);

				////// 
				////// // var rez_sel = ostypes.API('XSelectInput')(display, grabWin, ostypes.CONST.KeyPressMask);

				
				//////////////// // based on http://stackoverflow.com/a/28351174/1828637
				//////////////// // Connect to the X server.
				//////////////// var conn = ostypes.API('xcb_connect')(null, null);

				//////////////// OSStuff.conn = conn;
				//////////////// 
				//////////////// var rez_conerr = ostypes.API('xcb_connection_has_error')(conn);

				//////////////// 
				//////////////// if (!cutils.jscEqual(rez_conerr, 0)) {

				//////////////// 	throw new Error('error in xcb connection!!');
				//////////////// }
				//////////////// 
				//////////////// // get first screen
				//////////////// var setup = ostypes.API('xcb_get_setup')(conn);

				//////////////// 
				//////////////// var screen = ostypes.API('xcb_setup_roots_iterator')(setup);

				//////////////// 
				//////////////// 
				//////////////// // define the application as window manager
				//////////////// var select_input_val = ostypes.TYPE.uint32_t.array()([
				//////////////// 							ostypes.CONST.XCB_EVENT_MASK_SUBSTRUCTURE_REDIRECT
				//////////////// 							| ostypes.CONST.XCB_EVENT_MASK_SUBSTRUCTURE_NOTIFY
				//////////////// 							| ostypes.CONST.XCB_EVENT_MASK_ENTER_WINDOW
				//////////////// 							| ostypes.CONST.XCB_EVENT_MASK_LEAVE_WINDOW
				//////////////// 							| ostypes.CONST.XCB_EVENT_MASK_STRUCTURE_NOTIFY
				//////////////// 							| ostypes.CONST.XCB_EVENT_MASK_PROPERTY_CHANGE
				//////////////// 							| ostypes.CONST.XCB_EVENT_MASK_BUTTON_PRESS
				//////////////// 							| ostypes.CONST.XCB_EVENT_MASK_BUTTON_RELEASE
				//////////////// 							| ostypes.CONST.XCB_EVENT_MASK_FOCUS_CHANGE
				//////////////// 							| ostypes.CONST.XCB_EVENT_MASK_KEY_PRESS
				//////////////// 							| ostypes.CONST.XCB_EVENT_MASK_KEY_RELEASE
				//////////////// 						]);


				//////////////// 
				//////////////// var rez_chg = ostypes.API('xcb_change_window_attributes')(conn, screen.data.contents.root, ostypes.CONST.XCB_CW_EVENT_MASK, select_input_val);

				//////////////// 
				//////////////// // Need to xcb_flush to validate error handler
				//////////////// var rez_sync = ostypes.API('xcb_aux_sync')(conn);

				
				// var rez_poll = ostypes.API('xcb_poll_for_event')(conn);

				// if (!rez_poll.isNull()) {

				// }
				
				// var rez_flush = ostypes.API('xcb_flush')(conn);

				
				// tried creating a window to see if i can get events from there, it worked
				////////
				////////	var w = ostypes.API('xcb_generate_id')(conn);

				////////	
				////////	var mask = ostypes.CONST.XCB_CW_BACK_PIXEL | ostypes.CONST.XCB_CW_EVENT_MASK;
				////////	
				////////	var value_list = ostypes.TYPE.uint32_t.array()([
				////////		screen.data.contents.black_pixel, // Background color of the window (XCB_CW_BACK_PIXEL)
				////////		ostypes.CONST.XCB_EVENT_MASK_BUTTON_PRESS | ostypes.CONST.XCB_EVENT_MASK_BUTTON_RELEASE // Event masks (XCB_CW_EVENT_MASK)
				////////	]);
				////////	
				////////	var rezXcbCreateWindow = ostypes.API('xcb_create_window')(
				////////		conn,											// Connection
				////////		ostypes.CONST.XCB_COPY_FROM_PARENT,				// Depth
				////////		w,												// Window ID
				////////		screen.data.contents.root,						// Parent window
				////////		0,												// x
				////////		0,												// y
				////////		150,											// width
				////////		150,											// height
				////////		10,												// Border width in pixels
				////////		ostypes.CONST.XCB_WINDOW_CLASS_INPUT_OUTPUT,	// Window class
				////////		screen.data.contents.root_visual,				// Visual
				////////		mask,
				////////		value_list										// Window properties mask and values.
				////////	);

				////////	
				////////	// Map the window and ensure the server receives the map request.
				////////	var rezMap = ostypes.API('xcb_map_window')(conn, w);

				////////	
				////////	var rezFlush = ostypes.API('xcb_flush')(conn);

				////////
				
				// based on http://stackoverflow.com/q/14553810/1828637
				
				// Connect to the X server.
				var conn = ostypes.API('xcb_connect')(null, null);

				OSStuff.conn = conn;
				
				var rez_conerr = ostypes.API('xcb_connection_has_error')(conn);

				if (!cutils.jscEqual(rez_conerr, 0)) {

					throw new Error('error in xcb connection!!');
				}
				
				// xcb_key_symbols_t *keysyms = xcb_key_symbols_alloc(c);
				var keysyms = ostypes.API('xcb_key_symbols_alloc')(conn);

				
				// xcb_keycode_t *keycodes = xcb_key_symbols_get_keycode(keysyms, XK_space), keycode;
				var keycodesPtr = ostypes.API('xcb_key_symbols_get_keycode')(keysyms, ostypes.CONST.XK_Space);

				
				var keycodesArr = [];
				var addressOfElement = ctypes.UInt64(cutils.strOfPtr(keycodesPtr));
				while(true) {
					var el = ostypes.TYPE.xcb_keycode_t.ptr(addressOfElement);
					var val = el.contents; // no need for cutils.jscGetDeepest because xcb_keycode_t is ctypes.uint_8 which is a number
					if (val == ostypes.CONST.XCB_NO_SYMBOL) {
						break;
					}
					keycodesArr.push(val);
					addressOfElement = ctypes_math.UInt64.add(addressOfElement, ostypes.TYPE.xcb_keycode_t.size);
				}
				
				OSStuff.keycodesArr = keycodesArr;

				if (!keycodesArr.length) {

					return;
				}
				
				ostypes.API('free')(keycodesPtr); // returns undefined
				
				ostypes.API('xcb_key_symbols_free')(keysyms); // returns undefined
				
				// add bindings for all screens
				// iter = xcb_setup_roots_iterator (xcb_get_setup (c));
				var setup = ostypes.API('xcb_get_setup')(conn);

				
				var screens = ostypes.API('xcb_setup_roots_iterator')(setup);

				
				OSStuff.grabWins = [];
				var screensCnt = parseInt(cutils.jscGetDeepest(screens.rem));

				for (var i=0; i<screensCnt; i++) {


					for (var j=0; j<keycodesArr.length; j++) {
						// xcb_grab_key(c, true, iter.data->root, XCB_MOD_MASK_ANY, keycode, XCB_GRAB_MODE_SYNC, XCB_GRAB_MODE_SYNC);
						var rez_grab = ostypes.API('xcb_grab_key')(conn, 1, screens.data.contents.root, ostypes.CONST.XCB_MOD_MASK_ANY, keycodesArr[j], ostypes.CONST.XCB_GRAB_MODE_ASYNC, ostypes.CONST.XCB_GRAB_MODE_ASYNC);

						
						// var rez_err = ostypes.API('xcb_request_check')(conn, rez_grab);

						// if (!rez_err.isNull()) {

						// }
					}
					
					var chgValueList = ostypes.TYPE.uint32_t.array()([
						ostypes.CONST.XCB_EVENT_MASK_EXPOSURE | ostypes.CONST.XCB_EVENT_MASK_BUTTON_PRESS
					]);
					var rez_chg = ostypes.API('xcb_change_window_attributes')(conn, screens.data.contents.root, ostypes.CONST.XCB_CW_EVENT_MASK, chgValueList);

					
					OSStuff.grabWins.push(screens.data.contents.root);
					ostypes.API('xcb_screen_next')(screens.address()); // returns undefined
				}
				
				// ok screenI: 0 screens: xcb_screen_iterator_t(xcb_screen_t.ptr(ctypes.UInt64("0x7f9e1a93b754")), 0, 5856) HotkeyWorker.js:323:6
				// ok screenI: 1 screens: xcb_screen_iterator_t(xcb_screen_t.ptr(ctypes.UInt64("0x7f9e1abed994")), -1, 2826816) HotkeyWorker.js:323:6
				// ok screenI: 2 screens: xcb_screen_iterator_t(xcb_screen_t.ptr(ctypes.UInt64("0x7f9e1abed9bc")), -2, 40) HotkeyWorker.js:323:6
				// ok screenI: 3 screens: xcb_screen_iterator_t(xcb_screen_t.ptr(ctypes.UInt64("0x7f9e1abed9e4")), -3, 40)
				
				var rez_flush = ostypes.API('xcb_flush')(conn);

				
			break;
		case 'darwin':
		
				var eventType = ostypes.TYPE.EventTypeSpec();
				eventType.eventClass = ostypes.CONST.kEventClassKeyboard;
				eventType.eventKind = ostypes.CONST.kEventHotKeyPressed;
				
				var gMyHotKeyID = ostypes.TYPE.EventHotKeyID();
				var gMyHotKeyRef = ostypes.TYPE.EventHotKeyRef();
				
				var rez_appTarget = ostypes.API('GetApplicationEventTarget')();

				OSStuff.cHotKeyHandler = ostypes.TYPE.EventHandlerUPP(macHotKeyHandler);
				var rez_install = ostypes.API('InstallEventHandler')(rez_appTarget, OSStuff.cHotKeyHandler, 1, eventType.address(), null, null);

				
				gMyHotKeyID.signature =  ostypes.TYPE.OSType('1752460081'); // has to be a four char code. MACS is http://stackoverflow.com/a/27913951/1828637 0x4d414353 so i just used htk1 as in the example here http://dbachrach.com/blog/2005/11/program-global-hotkeys-in-cocoa-easily/ i just stuck into python what the stackoverflow topic told me and got it struct.unpack(">L", "htk1")[0]
				gMyHotKeyID.id = 1;
				
				var rez_appTarget2 = ostypes.API('GetEventDispatcherTarget')();

				var rez_reg = ostypes.API('RegisterEventHotKey')(49, ctypes_math.UInt64.add(ctypes.UInt64(ostypes.CONST.shiftKey), ctypes.UInt64(ostypes.CONST.cmdKey)), gMyHotKeyID, rez_appTarget2, 0, gMyHotKeyRef.address());

				ostypes.HELPER.convertLongOSStatus(rez_reg);
				
				OSStuff.runLoopMode = ostypes.HELPER.makeCFStr('com.mozilla.firefox.nativeshot');
				
			break;
		default:
			throw new Error('Operating system, "' + OS.Constants.Sys.Name + '" is not supported');
	}
}

function startEventLoop() {
	gEventLoopInterval = setInterval(checkEventLoop, gEventLoopIntervalMS);
}

function stopEventLoop() {
	clearInterval(gEventLoopInterval);
}

function checkEventLoop() {
	

	
	switch (core.os.mname) {
		case 'winnt':
		case 'winmo':
		case 'wince':
				
				var tookShot = false;
				while (ostypes.API('PeekMessage')(OSStuff.msg.address(), null, ostypes.CONST.WM_HOTKEY, ostypes.CONST.WM_HOTKEY, ostypes.CONST.PM_REMOVE)) {

					if (!tookShot) { // so if user pressed prnt screen multiple times during the interval, it wont trigger the shot multiple times
						if (cutils.jscEqual(OSStuff.msg.wParam, 1)) { // `1` and not `ostypes.CONST.VK_SNAPSHOT` because it reports the hotkey id, not the vk code
							tookShot = true;
							toggleTop();
						}
					}
				}
			
			break
		case 'gtk':
		
				////// var rez_pending = ostypes.API('XPending')(ostypes.HELPER.cachedXOpenDisplay());

				////// 
				////// var evPendingCnt = parseInt(cutils.jscGetDeepest(rez_pending));

				////// for (var i=0; i<evPendingCnt; i++) {
				////// 	//Block waiting for the next event.

				////// 	var rez_next = ostypes.API('XNextEvent')(ostypes.HELPER.cachedXOpenDisplay(), OSStuff.xev.address());

				////// 	

				////// 	if (cutils.jscEqual(OSStuff.xev.xkey.type, ostypes.CONST.KeyPress)) {

				////// 	}
				////// 	setTimeout(checkEventLoop, 0);
				////// }
				
				// var evt = ostypes.API('xcb_wait_for_event')(OSStuff.conn);

				// if (!evt.isNull()) {

					// ostypes.API('free')(evt);
				// }
				
				var evt = ostypes.API('xcb_poll_for_event')(OSStuff.conn);

				if (!evt.isNull()) {

					ostypes.API('free')(evt);
				}
				
			break;
		case 'darwin':
		
				// var cursorRgn = ostypes.TYPE.RgnHandle();
				var evRec = ostypes.TYPE.EventRecord();
				var everyEvent = 0;
				
				// var rez_waitEv = ostypes.API('WaitNextEvent')(everyEvent, evRec.address(), ostypes.TYPE.UInt32('32767'), cursorRgn);
				var rez_waitEv = ostypes.API('WaitNextEvent')(everyEvent, evRec.address(), 0, null);

				
				// var rez_run = ostypes.API('RunCurrentEventLoop')(1);

				
			break;
		default:
			throw new Error('Operating system, "' + OS.Constants.Sys.Name + '" is not supported');
	}
}

function macHotKeyHandler(nextHandler, theEvent, userDataPtr) {
	// EventHandlerCallRef nextHandler, EventRef theEvent, void *userData

	return 1; // must be of type ostypes.TYPE.OSStatus
}

function toggleTop() {

	var hForeground = ostypes.API('GetForegroundWindow')();

	
	if (hForeground.isNull()) {

		return false;
	}
	
	var rez_getTop = ostypes.API('GetWindowLongPtr')(hForeground, ostypes.CONST.GWL_EXSTYLE);

	
	// if rez_getTop == 0 then it failed, should test ctypes.winLastError
	
	// for now assume it succeeded
	
	// figure out what to toggle to
	var toggleToFlag;
	var toggleToTop; // false means to normal. true means to top
	if (!cutils.jscEqual(ctypes_math.UInt64.and(cutils.jscGetDeepest(rez_getTop), ostypes.CONST.WS_EX_TOPMOST), 0)) {
		// window IS always on top
		toggleToFlag = ostypes.CONST.HWND_NOTOPMOST;
		toggleToTop = false;
	} else {
		// window is NOT always on top
		toggleToFlag = ostypes.CONST.HWND_TOPMOST;
		toggleToTop = true;
	}
	
	// toggle it
	var rez_setTop = ostypes.API('SetWindowPos')(hForeground, toggleToFlag, 0, 0, 0, 0, ostypes.CONST.SWP_NOSIZE | ostypes.CONST.SWP_NOMOVE/* | ostypes.CONST.SWP_NOREDRAW*/); // window wasnt moved so no need for SWP_NOREDRAW, the NOMOVE and NOSIZE params make it ignore x, y, cx, and cy

	
	if (rez_setTop) {
		if (toggleToTop) {

		} else {

		}
		return true;
	} else {
		if (toggleToTop) {

		} else {

		}
		return false;
	}
}
// end - addon functionality

// start - common helpers
// end - common helpers