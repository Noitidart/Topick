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
			images: 'chrome://topick/content/images/',
			locale: 'chrome://topick/content/locale/',
			modules: 'chrome://topick/content/modules/',
			pages: 'chrome://topick/content/pages/',
			scripts: 'chrome://topick/content/scripts/',
			styles: 'chrome://topick/content/styles/'
		},
		prefbranch: 'extensions.Topick@jetpack.',
		prefs: {},
		cache_key: Math.random() // set to version on release
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

function install() {}
function uninstall() {}

function startup(aData, aReason) {
	
}

function shutdown(aData, aReason) {
	if (aReason == APP_SHUTDOWN) { return }

}