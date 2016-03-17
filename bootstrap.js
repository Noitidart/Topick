// Imports
const {classes: Cc, interfaces: Ci, manager: Cm, results: Cr, utils: Cu, Constructor: CC} = Components;
Cm.QueryInterface(Ci.nsIComponentRegistrar);

const PromiseWorker = Cu.import('resource://gre/modules/PromiseWorker.jsm').BasePromiseWorker;
Cu.import('resource://gre/modules/osfile.jsm');
Cu.import('resource://gre/modules/Services.jsm');
Cu.import('resource://gre/modules/XPCOMUtils.jsm');

// Globals
var core = { // core has stuff added into by MainWorker (currently MainWorker) and then it is updated
	addon: {
		name: 'Topick',
		id: 'Topick@jetpack',
		path: {
			name: 'topick',
			content: 'chrome://topick/content/',
			locale: 'chrome://topick/content/locale/',
			modules: 'chrome://topick/content/modules/',
			images: 'chrome://topick/content/resources/images/',
			pages: 'chrome://topick/content/resources/pages/',
			scripts: 'chrome://topick/content/resources/scripts/',
			styles: 'chrome://topick/content/resources/styles/'
		},
		prefbranch: 'extensions.Topick@jetpack.',
		prefs: {},
		cache_key: 'v1.0', // set to version on release
		locale: {
			all: {
				aboutpage_desc: 'Configure and customize settings of Topick'
			}
		}
	},
	os: {
		name: OS.Constants.Sys.Name.toLowerCase(),
		toolkit: Services.appinfo.widgetToolkit.toLowerCase(),
		xpcomabi: Services.appinfo.XPCOMABI
	},
	firefox: {
		pid: Services.appinfo.processID,
		version: Services.appinfo.version
	}
};

var BOOTSTRAP = this;
var bootstrap = this;
var gTimer = Cc['@mozilla.org/timer;1'].createInstance(Ci.nsITimer);

// start - addon functionalities
function startFeedFramescript(aMessageManager) {
	// xpcomSetInterval(gTimer, 1000, function() {
	// 	aMessageManager.sendAsyncMessage(core.addon.id, (new Date()).toLocaleString())
	// });
}

var HotkeyWorkerMainThreadFuncs = {
	
};

// end - addon functionalities

// start - about module
var aboutFactory_instance;
function AboutPage() {}

function initAndRegisterAbout() {
	// init it
	AboutPage.prototype = Object.freeze({
		classDescription: core.addon.locale.all.aboutpage_desc,
		contractID: '@mozilla.org/network/protocol/about;1?what=topick',
		classID: Components.ID('{cdbf6270-ec0d-11e5-a837-0800200c9a66}'),
		QueryInterface: XPCOMUtils.generateQI([Ci.nsIAboutModule]),

		getURIFlags: function(aURI) {
			return Ci.nsIAboutModule.ALLOW_SCRIPT | Ci.nsIAboutModule.URI_CAN_LOAD_IN_CHILD;
		},

		newChannel: function(aURI, aSecurity_or_aLoadInfo) {
			var redirUrl = core.addon.path.pages + 'options.xhtml';

			var channel;
			if (Services.vc.compare(core.firefox.version, '47.*') > 0) {
				var redirURI = Services.io.newURI(redirUrl, null, null);
				channel = Services.io.newChannelFromURIWithLoadInfo(redirURI, aSecurity_or_aLoadInfo);
			} else {
				channel = Services.io.newChannel(redirUrl, null, null);
			}
			channel.originalURI = aURI;
			
			return channel;
		}
	});
	
	// register it
	aboutFactory_instance = new AboutFactory(AboutPage);
	

}

function AboutFactory(component) {
	this.createInstance = function(outer, iid) {
		if (outer) {
			throw Cr.NS_ERROR_NO_AGGREGATION;
		}
		return new component();
	};
	this.register = function() {
		Cm.registerFactory(component.prototype.classID, component.prototype.classDescription, component.prototype.contractID, this);
	};
	this.unregister = function() {
		Cm.unregisterFactory(component.prototype.classID, this);
	}
	Object.freeze(this);
	this.register();
}
// end - about module

// start - server/framescript comm layer
var fsMsgListener = {
	receiveMessage: function(aMsgEvent) {


		if (aMsgEvent.data == 'feed me') {
			startFeedFramescript(aMsgEvent.target.messageManager);
		}
	}
};
// end - server/framescript comm layer

function install() {}
function uninstall() {}

function startup(aData, aReason) {
	
	extendCore();
	
	// set stuff in core, as it is sent to worker
	core.addon.version = aData.version;
	
	var promise_initHotkeys = SIPWorker('HotkeyWorker', core.addon.path.content + 'modules/hotkey/HotkeyWorker.js', core, HotkeyWorkerMainThreadFuncs).post();
	promise_initHotkeys.then(
		function(aVal) {

			
		},
		genericReject.bind(null, 'promise_initHotkeys', 0)
	).catch(genericCatch.bind(null, 'promise_initHotkeys', 0));
	
	// register about page
	initAndRegisterAbout();
	
	// register about pages listener
	Services.mm.addMessageListener(core.addon.id, fsMsgListener);
}

function shutdown(aData, aReason) {
	if (aReason == APP_SHUTDOWN) { return }

	// destroy workers
	if (bootstrap.HotkeyWorker && HotkeyWorker.launchTimeStamp) {
		var promise_requestTerm = HotkeyWorker.post('prepTerm', []);
		promise_requestTerm.then(
			function(aVal) {

				HotkeyWorker._worker.terminate();
			},
			genericReject.bind(null, 'promise_requestTerm', 0)
		).catch(genericCatch.bind(null, 'promise_requestTerm', 0));
	}
	
	// unregister about page
	aboutFactory_instance.unregister();
	
	// cancel feeding
	gTimer.cancel();
	
	// unregister about pages listener
	Services.mm.removeMessageListener(core.addon.id, fsMsgListener);
}

// start - common helper functions
function extendCore() {
	// adds some properties i use to core based on the current operating system, it needs a switch, thats why i couldnt put it into the core obj at top
	switch (core.os.name) {
		case 'winnt':
		case 'winmo':
		case 'wince':
			core.os.version = parseFloat(Services.sysinfo.getProperty('version'));
			// http://en.wikipedia.org/wiki/List_of_Microsoft_Windows_versions
			if (core.os.version == 6.0) {
				core.os.version_name = 'vista';
			}
			if (core.os.version >= 6.1) {
				core.os.version_name = '7+';
			}
			if (core.os.version == 5.1 || core.os.version == 5.2) { // 5.2 is 64bit xp
				core.os.version_name = 'xp';
			}
			break;
			
		case 'darwin':
			var userAgent = myServices.hph.userAgent;

			var version_osx = userAgent.match(/Mac OS X 10\.([\d\.]+)/);

			
			if (!version_osx) {
				throw new Error('Could not identify Mac OS X version.');
			} else {
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
				// this makes it so that 10.10.0 becomes 10.100
				// 10.10.1 => 10.101
				// so can compare numerically, as 10.100 is less then 10.101
				
				//core.os.version = 6.9; // note: debug: temporarily forcing mac to be 10.6 so we can test kqueue
			}
			break;
		default:
			// nothing special
	}
	

}

function xpcomSetInterval(aNsiTimer, aDelayTimerMS, aTimerCallback) {
	aNsiTimer.initWithCallback({
		notify: function() {
			aTimerCallback();
		}
	}, aDelayTimerMS, Ci.nsITimer.TYPE_REPEATING_PRECISE);
}

function Deferred() { // rev3 - https://gist.github.com/Noitidart/326f1282c780e3cb7390
	// update 062115 for typeof
	if (typeof(Promise) != 'undefined' && Promise.defer) {
		//need import of Promise.jsm for example: Cu.import('resource:/gree/modules/Promise.jsm');
		return Promise.defer();
	} else if (typeof(PromiseUtils) != 'undefined'  && PromiseUtils.defer) {
		//need import of PromiseUtils.jsm for example: Cu.import('resource:/gree/modules/PromiseUtils.jsm');
		return PromiseUtils.defer();
	} else {
		/* A method to resolve the associated Promise with the value passed.
		 * If the promise is already settled it does nothing.
		 *
		 * @param {anything} value : This value is used to resolve the promise
		 * If the value is a Promise then the associated promise assumes the state
		 * of Promise passed as value.
		 */
		this.resolve = null;

		/* A method to reject the assocaited Promise with the value passed.
		 * If the promise is already settled it does nothing.
		 *
		 * @param {anything} reason: The reason for the rejection of the Promise.
		 * Generally its an Error object. If however a Promise is passed, then the Promise
		 * itself will be the reason for rejection no matter the state of the Promise.
		 */
		this.reject = null;

		/* A newly created Pomise object.
		 * Initially in pending state.
		 */
		this.promise = new Promise(function(resolve, reject) {
			this.resolve = resolve;
			this.reject = reject;
		}.bind(this));
		Object.freeze(this);
	}
}

function genericReject(aPromiseName, aPromiseToReject, aReason) {
	var rejObj = {
		name: aPromiseName,
		aReason: aReason
	};

	if (aPromiseToReject) {
		aPromiseToReject.reject(rejObj);
	}
}
function genericCatch(aPromiseName, aPromiseToReject, aCaught) {
	var rejObj = {
		name: aPromiseName,
		aCaught: aCaught
	};

	if (aPromiseToReject) {
		aPromiseToReject.reject(rejObj);
	}
}


// SIPWorker - rev9 - https://gist.github.com/Noitidart/92e55a3f7761ed60f14c
const SIP_CB_PREFIX = '_a_gen_cb_';
const SIP_TRANS_WORD = '_a_gen_trans_';
var sip_last_cb_id = -1;
function SIPWorker(workerScopeName, aPath, aCore=core, aFuncExecScope=BOOTSTRAP) {
	// update 022016 - delayed init till first .post
	// update 010516 - allowing pomiseworker to execute functions in this scope, supply aFuncExecScope, else leave it undefined and it will not set this part up
	// update 122115 - init resolves the deferred with the value returned from Worker, rather then forcing it to resolve at true
	// "Start and Initialize PromiseWorker"
	// returns promise
		// resolve value: jsBool true
	// aCore is what you want aCore to be populated with
	// aPath is something like `core.addon.path.content + 'modules/workers/blah-blah.js'`
	
	// :todo: add support and detection for regular ChromeWorker // maybe? cuz if i do then ill need to do ChromeWorker with callback
	
	// var deferredMain_SIPWorker = new Deferred();

	var cWorkerInited = false;
	var cWorkerPost_orig;
	
	if (!(workerScopeName in bootstrap)) {
		bootstrap[workerScopeName] = new PromiseWorker(aPath);
		
		cWorkerPost_orig = bootstrap[workerScopeName].post;
		
		bootstrap[workerScopeName].post = function(pFun, pArgs, pCosure, pTransfers) {
			if (!cWorkerInited) {
				var deferredMain_post = new Deferred();
				
				bootstrap[workerScopeName].post = cWorkerPost_orig;
				
				var doInit = function() {
					var promise_initWorker = bootstrap[workerScopeName].post('init', [aCore]);
					promise_initWorker.then(
						function(aVal) {

							// start - do stuff here - promise_initWorker
							if (pFun) {
								doOrigPost();
							} else {
								// pFun is undefined, meaning devuser asked for instant init
								deferredMain_post.resolve(aVal);
							}
							// end - do stuff here - promise_initWorker
						},
						genericReject.bind(null, 'promise_initWorker', deferredMain_post)
					).catch(genericCatch.bind(null, 'promise_initWorker', deferredMain_post));
				};
				
				var doOrigPost = function() {
					var promise_origPosted = bootstrap[workerScopeName].post(pFun, pArgs, pCosure, pTransfers);
					promise_origPosted.then(
						function(aVal) {

							deferredMain_post.resolve(aVal);
						},
						genericReject.bind(null, 'promise_origPosted', deferredMain_post)
					).catch(genericCatch.bind(null, 'promise_origPosted', deferredMain_post));
				};
				
				doInit();
				return deferredMain_post.promise;
			}
		};
		
		// start 010516 - allow worker to execute functions in bootstrap scope and get value
		if (aFuncExecScope) {
			// this triggers instantiation of the worker immediately
			var origOnmessage = bootstrap[workerScopeName]._worker.onmessage;
			var origOnerror = bootstrap[workerScopeName]._worker.onerror;
			
			bootstrap[workerScopeName]._worker.onerror = function(onErrorEvent) {
				// got an error that PromiseWorker did not know how to serialize. so we didnt get a {fail:.....} postMessage. so in onerror it does pop of the deferred. however with allowing promiseworker to return async, we cant simply pop if there are more then 1 promises pending
				var cQueue = bootstrap[workerScopeName]._queue._array;
				if (cQueue.length === 1) {

					// DO NOTE THOUGH - .onerror message might come in from any error, it is innate to worker to send this message on error, so it will pop out the promise early, so maybe i might run this origOnerror before the actual promise rejects due to catch
					origOnerror(onErrorEvent);
				} else {
					onErrorEvent.preventDefault(); // as they do this in origOnerror so i prevent here too

				}
			};
			
			bootstrap[workerScopeName]._worker.onmessage = function(aMsgEvent) {
				////// start - my custom stuff
				var aMsgEventData = aMsgEvent.data;

				if (Array.isArray(aMsgEventData)) {
					// my custom stuff, PromiseWorker did self.postMessage to call a function from here

					
					var callbackPendingId;
					if (typeof aMsgEventData[aMsgEventData.length-1] == 'string' && aMsgEventData[aMsgEventData.length-1].indexOf(SIP_CB_PREFIX) == 0) {
						callbackPendingId = aMsgEventData.pop();
					}
					
					var funcName = aMsgEventData.shift();
					if (funcName in aFuncExecScope) {
						var rez_mainthread_call = aFuncExecScope[funcName].apply(null, aMsgEventData);
						
						if (callbackPendingId) {
							if (rez_mainthread_call.constructor.name == 'Promise') { // if get undefined here, that means i didnt return an array from the function in main thread that the worker called
								rez_mainthread_call.then(
									function(aVal) {
										if (aVal.length >= 2 && aVal[aVal.length-1] == SIP_TRANS_WORD && Array.isArray(aVal[aVal.length-2])) {
											// to transfer in callback, set last element in arr to SIP_TRANS_WORD and 2nd to last element an array of the transferables									// cannot transfer on promise reject, well can, but i didnt set it up as probably makes sense not to

											aVal.pop();
											bootstrap[workerScopeName]._worker.postMessage([callbackPendingId, aVal], aVal.pop());
										} else {
											bootstrap[workerScopeName]._worker.postMessage([callbackPendingId, aVal]);
										}
									},
									function(aReason) {

										bootstrap[workerScopeName]._worker.postMessage([callbackPendingId, ['promise_rejected', aReason]]);
									}
								).catch(
									function(aCatch) {

										bootstrap[workerScopeName]._worker.postMessage([callbackPendingId, ['promise_rejected', aCatch]]);
									}
								);
							} else {
								// assume array
								if (rez_mainthread_call.length > 2 && rez_mainthread_call[rez_mainthread_call.length-1] == SIP_TRANS_WORD && Array.isArray(rez_mainthread_call[rez_mainthread_call.length-2])) {
									// to transfer in callback, set last element in arr to SIP_TRANS_WORD and 2nd to last element an array of the transferables									// cannot transfer on promise reject, well can, but i didnt set it up as probably makes sense not to
									rez_mainthread_call.pop();

									bootstrap[workerScopeName]._worker.postMessage([callbackPendingId, rez_mainthread_call], rez_mainthread_call.pop());
								} else {
									bootstrap[workerScopeName]._worker.postMessage([callbackPendingId, rez_mainthread_call]);
								}
							}
						}
					}

					////// end - my custom stuff
				} else {
					// find the entry in queue that matches this id, and move it to first position, otherwise i get the error `Internal error: expecting msg " + handler.id + ", " + " got " + data.id + ` --- this guy uses pop and otherwise might get the wrong id if i have multiple promises pending
					var cQueue = bootstrap[workerScopeName]._queue._array;
					var cQueueItemFound;
					for (var i=0; i<cQueue.length; i++) {
						if (cQueue[i].id == aMsgEvent.data.id) {
							cQueueItemFound = true;
							if (i !== 0) {
								// move it to first position

								cQueue.splice(0, 0, cQueue.splice(i, 1)[0]);

							}

							break;
						}
					}
					if (!cQueueItemFound) {

					}
					origOnmessage(aMsgEvent);
				}
			}
		}
		// end 010516 - allow worker to execute functions in bootstrap scope and get value
		
		if ('addon' in aCore && 'aData' in aCore.addon) {
			delete aCore.addon.aData; // we delete this because it has nsIFile and other crap it, but maybe in future if I need this I can try JSON.stringify'ing it
		}
	} else {
		throw new Error('Something is loaded into bootstrap[workerScopeName] already');
	}
	
	// return deferredMain_SIPWorker.promise;
	return bootstrap[workerScopeName];
	
}

// sendAsyncMessageWithCallback - rev3
const SAM_CB_PREFIX = '_sam_gen_cb_';
var sam_last_cb_id = -1;
function sendAsyncMessageWithCallback(aMessageManager, aGroupId, aMessageArr, aCallbackScope, aCallback) {
	sam_last_cb_id++;
	var thisCallbackId = SAM_CB_PREFIX + sam_last_cb_id;
	aCallbackScope = aCallbackScope ? aCallbackScope : bootstrap;
	aCallbackScope[thisCallbackId] = function(aMessageArr) {
		delete aCallbackScope[thisCallbackId];
		aCallback.apply(null, aMessageArr);
	}
	aMessageArr.push(thisCallbackId);
	aMessageManager.sendAsyncMessage(aGroupId, aMessageArr);
}
// end - common helper functions