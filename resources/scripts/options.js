const {interfaces: Ci} = Components;

// Globals
var core = {
	addon: {
		id: 'Topick@jetpack'
	}
};
var gCFMM;

// start - 
document.addEventListener('DOMContentLoaded', doOnContentLoad, false);

function doOnContentLoad() {
	contentMMFromContentWindow_Method2(content).sendAsyncMessage(core.addon.id, 'feed me');
}
// end - 

// start - server/framescript comm layer
var bootstrapMsgListener = {
	receiveMessage: function(aMsgEvent) {
		console.log('FRAMESCRIPT getting message FROM BOOTSTRAP, data:', aMsgEvent.data);
		document.getElementById('main_wrap').textContent = aMsgEvent.data;
	}
};

contentMMFromContentWindow_Method2(content).addMessageListener(core.addon.id, bootstrapMsgListener);
// end - server/framescript comm layer

// start - common helper functions
function contentMMFromContentWindow_Method2(aContentWindow) {
	if (!gCFMM) {
		gCFMM = aContentWindow.QueryInterface(Ci.nsIInterfaceRequestor)
							  .getInterface(Ci.nsIDocShell)
							  .QueryInterface(Ci.nsIInterfaceRequestor)
							  .getInterface(Ci.nsIContentFrameMessageManager);
	}
	return gCFMM;

}
// end - common helper functions