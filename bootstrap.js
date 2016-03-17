// Imports
const {classes: Cc, interfaces: Ci, manager: Cm, results: Cr, utils: Cu, Constructor: CC} = Components;
Cm.QueryInterface(Ci.nsIComponentRegistrar);

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
		cache_key: Math.random(), // set to version on release
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
var gTimer = Cc['@mozilla.org/timer;1'].createInstance(Ci.nsITimer);

// start - addon functionalities
function startFeedFramescript(aMessageManager) {
	xpcomSetInterval(gTimer, 1000, function() {
		aMessageManager.sendAsyncMessage(core.addon.id, (new Date()).toLocaleString())
	});
}
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
	
	console.log('aboutFactory_instance:', aboutFactory_instance);
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
		console.log('BOOTSTRAP getting message FROM FRAMESCRIPT, data:', aMsgEvent.data);

		if (aMsgEvent.data == 'feed me') {
			startFeedFramescript(aMsgEvent.target.messageManager);
		}
	}
};
// end - server/framescript comm layer

function install() {}
function uninstall() {}

function startup(aData, aReason) {
	
	// register about page
	initAndRegisterAbout();
	
	// register about pages listener
	Services.mm.addMessageListener(core.addon.id, fsMsgListener);
}

function shutdown(aData, aReason) {
	if (aReason == APP_SHUTDOWN) { return }

	// unregister about page
	aboutFactory_instance.unregister();
	
	// cancel feeding
	gTimer.cancel();
	
	// unregister about pages listener
	Services.mm.removeMessageListener(core.addon.id, fsMsgListener);
}

// start - common helper functions

function xpcomSetInterval(aNsiTimer, aDelayTimerMS, aTimerCallback) {
	aNsiTimer.initWithCallback({
		notify: function() {
			aTimerCallback();
		}
	}, aDelayTimerMS, Ci.nsITimer.TYPE_REPEATING_PRECISE);
}
// end - common helper functions