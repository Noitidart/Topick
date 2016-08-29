hydrant_ex_instructions = { // stuff that shouldnt get written to hydrants entry in filestore. updating this is handled manually by dev
	filestore_entries: ['prefs'],
	addon_info: true
};
hydrant_ex = {
	prefs: {},
	addon_info: {}
};

initAppPage = function(aArg) {
	// aArg is what is received by the call in `init`
	// filter hydrant to just prefs i care about

	gAppPageComponents = [
		React.createElement(Header),
		React.createElement(RowsContainer)
	];

}

uninitAppPage = function() {

}

focusAppPage = function() {
	console.error('focused!!!!!!');
	callInMainworker('fetchCore', { nocore:true, hydrant_ex_instructions }, function(aArg) {
		store.dispatch(setMainKeys(aArg.hydrant_ex));
	});
}

shouldUpdateHydrantEx = function() {
	console.log('in shouldUpdateHydrantEx');

	var state = store.getState();

	if (gSupressUpdateHydrantExOnce) {
		console.log('hydrant_ex update supressed once');
		gSupressUpdateHydrantExOnce = false;
		return;
	}

	// check if hydrant_ex updated
	var hydrant_ex_updated = false;
	for (var p in hydrant_ex) {
		var is_different = React.addons.shallowCompare({props:hydrant_ex[p]}, state[p]);
		if (is_different) {
			console.log('something in', p, 'of hydrant_ex was updated');
			hydrant_ex_updated = true;

			if (!gSupressUpdateHydrantExOnce) {
				// update file stores or whatever store this key in hydrant_ex is connected to
				if (hydrant_ex_instructions.filestore_entries && hydrant_ex_instructions.filestore_entries.includes(p)) {
					callInMainworker('updateFilestoreEntry', {
						mainkey: p,
						value: state[p]
					});
				} else if (p == 'addon_info') {
					// make sure it is just applyBackgroundUpdates, as i only support changing applyBackgroundUpdates
					if (hydrant_ex.addon_info.applyBackgroundUpdates !== state.addon_info.applyBackgroundUpdates) {
						callInBootstrap('setApplyBackgroundUpdates', state.addon_info.applyBackgroundUpdates);
					}
				}
			}
			console.log('compared', p, 'is_different:', is_different, 'state:', state[p], 'hydrant_ex:', hydrant_ex[p]);
			hydrant_ex[p] = state[p];
			// break; // dont break because we want to update the hydrant_ex in this global scope for future comparing in this function.
		}
	}

	console.log('done shouldUpdateHydrantEx');
}


// REACT COMPONENTS - PRESENTATIONAL
var Header = React.createClass({
	render: function() {
		return React.createElement('h1', undefined,
			React.createElement('span', undefined,
				formatStringFromNameCore('addon_name', 'main')
			)
		);
	}
});

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
var Rows = React.createClass({
	render: function() {
		var { recording, hotkey } = this.props; // mapped state

		// determine display for hotkey_pref_row depending on `recording` state
		var hotkey_pref_row_props;
		hotkey_pref_row_props = {
			name:'hotkey',
			type:'buttons',
			icon: 'keyboard',
			classes: 'col-lg-5 col-lg-offset-0 col-md-6 col-md-offset-0 col-sm-8 col-sm-offset-2 col-xs-12'
		};
		if (!recording) {
			var hotkey_str = [];

			Object.assign(hotkey_pref_row_props, {
				buttons: [
					{name:'change', value:'change'}
				],
				descs: [
					{ name:'hotkey_desc1', reps:[ buildHotkeyStr(hydrant_ex.prefs.hotkey) ] }
				]
			});
		} else {
			var hotkey_changing_rep;
			if (!recording.name && (!recording.mods || !Object.keys(recording.mods).length)) {
				// that means it just started. so show "Press any key to record". as after mutate, `name` is made `undefined` while no name was set and if say just mods pushed
				hotkey_changing_rep = formatStringFromNameCore('hotkey_changing_start', 'main');
			} else {
				hotkey_changing_rep = buildHotkeyStr(recording);
			}

			Object.assign(hotkey_pref_row_props, {
				buttons: [
					{name:'listening', value:hotkey} // value hotkey - so it shows it as "active"
				],
				descs: [
					{ name:'hotkey_changing_desc1', reps:[hotkey_changing_rep] }
				]
			});
		}

		return React.createElement('div', { className:'container' },
			React.createElement('div', { className:'row' },
				React.createElement(RowPrefContainer, {
					name:'autoupdate',
					type:'buttons',
					icon: 'gears',
					buttons: [
						{ name:'off', value:0 },
						{ name:'on', value:2 }
					],
					setter:setAddonInfo,
					descs: [
						{ name:'autoupdate_desc1', reps:[ core.addon.version ] },
						{ name:'autoupdate_desc2', reps:[ formatTime(hydrant_ex.addon_info.updateDate, { time:false }) ] }
					],
					classes: 'col-lg-5 col-lg-offset-1 col-md-6 col-md-offset-0 col-sm-8 col-sm-offset-2 col-xs-12'
				}),
				React.createElement(RowPrefContainer, hotkey_pref_row_props)
			)
		);
	}
});


var RowPref = React.createClass({
	render: function() {
		var { type, min, max, buttons, name, descs, icon, classes } = this.props; // attributes
		var { value } = this.props; // mapped state
		var { setValue } = this.props; // dispatchers

		/* about attributes link12921
		 * type - string; default=ERROR enum[buttons, number]
		 * min, max - number; default=undefined; only if type "number". if undefiend no limit.
		 * buttons - array; default=ERROR; only if type "buttons". array of objects. `name` is l10n key of button caption, and `value` is value. the array is sorted and displayed in alpha order after localization.
		 * setter - function; default=setPref.bind(null, name); should be a dispatcher, as redux will wrap this in `disspatch()`
		 * name - string; default=ERROR; used in `formatStringFromNameCore` to get label. also used with setPref
		 * descs - array of objects - [{name:,reps:['hi']}] - `name` is key in `main` for `formatStringFromNameCore`. and reps is optional, defaults to undefined, you should set to array for `formatStringFromNameCore`
		 * icon - string; default=undefined; use in class as `icon-keyboard`
		 * classes - string; default=undefined; addtional classes to add to the block(i call it row but i should have called it block)
		 */


		if (!type) { console.error('no type set!'); throw new Error('no type set!'); }
		if (type == 'buttons' && !buttons) { console.error('must set buttons for type "buttons" set!'); throw new Error('must set labels for type "buttons" set!'); }

		var type_to_rcls = { // type to react class
			buttons: ButtonGroup,
			number: InputNumber
		};

		var type_to_props = { // type to props for react class
			buttons: { value, setValue, buttons },
			number: { defaultValue:value, id:name, dispatcher:setValue, min, max, parent_noactions:true }
		};

		return React.createElement('div', { className:classes },
			React.createElement('div', { className:'grey-box-icon' },
				React.createElement('div', { className:'icon-box-top grey-box-icon-pos' },
					React.createElement('i', { className:'fontawesome-icon medium circle-white center icon-' + icon })
				),
				React.createElement('h4', undefined,
					formatStringFromNameCore(name, 'main')
				),
				React.createElement('p', undefined,
					descs.map( el =>
						React.createElement('span', undefined,
							formatStringFromNameCore(el.name, 'main', el.reps)
						)
					)
				),
				React.createElement(type_to_rcls[type], type_to_props[type])
			)
		);
	}
});

var ButtonGroup = React.createClass({
	render: function() {
		var { value, setValue, buttons } = this.props; // attributes

		/* about attributes
		 * buttons - see link12921
		 */

		// sort buttons after localizing it
		var buttons_sorted = buttons.map(el=>Object.assign({}, el, {locale:formatStringFromNameCore(el.name, 'main')})).sort((a,b)=>a.locale.localeCompare(b.locale));

		return React.createElement('ul', { className:'nav nav-pills nav-justified' },
			buttons_sorted.map( el => React.createElement(ButtonGroupBtn, Object.assign({ active_value:value, setValue }, el)) )
		)
	}
});

var ButtonGroupBtn = React.createClass({
	onClick: function(e) {
		var { setValue, value } = this.props;

		if (typeof(value) == 'object') {
			console.warn('its in listening mode');
		} else if (value == 'change') {
			// special for "Change" hotkey
			store.dispatch(startRecording());
		} else {
			// generic
			setValue(value);
		}

		e.stopPropagation();
		e.preventDefault();
	},
	render: function() {
		var { active_value, setValue, name, value, locale } = this.props;

		return React.createElement('li', { role:'presentation', className:(active_value === value ? 'active' : undefined) },
			React.createElement('a', { onClick:this.onClick },
				locale
			)
		)
	}
});

var gInputNumberId = 1;
var InputNumber = React.createClass({
	render: function() {
		// fetch all props as domProps
		var domProps = Object.assign({}, this.props);

		// remove progrmatically used props from domProps, and put them into here
		var progProps = {}; // holds values
		this.progProps = progProps;
		var progPropDefaults = {
			crement: 1, // must be min of 1
			sensitivty: 10, // must be min of 1 - while dragging mouse this many pixels will result in change of crement
			cursor: 'ew-resize',
			min: undefined, // optional
			max: undefined, // optional
			dispatcher: undefined, // not optional, must be provided by parent component // dispatcher is a function that takes one argument. and will pass this argment to dispatch(actionCreator(...))
			parent_noactions: false, // set this to true if you dont want any of the functionalities on the parent node
			parent_novalidation: false
		};

		for (var name in progPropDefaults) {
			if (name in domProps) {
				progProps[name] = domProps[name];
				delete domProps[name];
			} else {
				progProps[name] = progPropDefaults[name];
			}
		}

		if (!progProps.dispatcher) { console.error('deverror'); throw new Error('dispatcher is required in this.props!') }

		// validate domProps and add the progrmatic ones
		domProps.className = domProps.className ? domProps.className + ' inputnumber' : 'inputnumber';
		if (!('id' in domProps)) { domProps.id = gInputNumberId++ }
		if (!domProps.maxLength && progProps.max) { domProps.maxLength = (progProps.max+'').length }
		domProps.ref = 'input';
		domProps.onWheel = this.wheel;
		domProps.onKeyDown = this.keydown;
		domProps.onChange = this.change;

		return React.createElement(ReactBootstrap.FormGroup, { controlId:domProps.id },
			// React.createElement(ReactBootstrap.ControlLabel, undefined, 'label'),
			React.createElement(ReactBootstrap.FormControl, domProps)
		);
	},
	componentDidUpdate: function(prevProps, prevState) {
		console.log('input number updated, prevProps.defaultValue:', prevProps.defaultValue, 'nowProps.defaultValue:', this.props.defaultValue, 'dom.value:', this.value);
		if (this.props.defaultValue != this.value) {
			// need to update value
			this.value = this.props.defaultValue;
			ReactDOM.findDOMNode(this.refs.input).value = this.value;
			// update dom error class
			this.setValid();
		}
	},
	componentDidMount: function() {
		if (!this.props.parent_noactions) {
			ReactDOM.findDOMNode(this.refs.input).parentNode.addEventListener('wheel', this.wheel, false);
		}

		// set up local globals
		// this.value is the physically value that is currently showing in the input, NOT necessarily what is in the state object
		if (!('defaultValue' in this.props)) { console.error('deverror'); throw new Error('in my design i expect for a defaultValue to be there') }
		this.value = this.props.defaultValue; // this.value must always be a js number
		this.valid = true; // needed otherwise, if this.setValid finds this.value to be valid, it will try to remove from classList, its an unnecessary dom action
		this.setValid(); // this will set this.valid for me
		console.log('ok mounted');

		if (!this.props.parent_noactions) {
			// set up parent node mouse drag stuff
			ReactDOM.findDOMNode(this.refs.input).parentNode.classList.add('inputnumber-parent');
			ReactDOM.findDOMNode(this.refs.input).parentNode.addEventListener('mousedown', this.mousedown, false);
		}
	},
	comonentWillUnmount: function() {
		// TODO: figure out if on reconcile, if this wheel event is still on it
		if (!this.props.parent_noactions) {
		    ReactDOM.findDOMNode(this.refs.input).parentNode.removeEventListener('wheel', this.wheel, false);
			ReactDOM.findDOMNode(this.refs.input).parentNode.classList.remove('inputnumber-parent');
		}
	},
	setValid: function() {
		// updates dom, based on physical value in dom - this.value
			// this.valid states if this.value is valid. and this.value is what is physically in the dom field
		// return value tells you that the dom is currently valid or not
		var valid = this.testValid(this.value);
		if (valid !== this.valid) {
			this.valid = valid;
			console.log('this.valid updated to:', valid);
			if (!valid) {
				if (!this.props.parent_novalidation) {
					ReactDOM.findDOMNode(this.refs.input).parentNode.classList.add('has-error');
				}
			} else {
				if (!this.props.parent_novalidation) {
					ReactDOM.findDOMNode(this.refs.input).parentNode.classList.remove('has-error');
				}
			}
		}
		return valid;
	},
	testValid: function(value) {
		// acts on virtual value. NOT what is physically in dom. thus a value must be passed in as argument
		// returns false if invalid, returns true if valid
		if (isNaN(value)) {
			console.error('value is isNaN', value);
			return false;
		} else if (value === '') {
			console.error('value is blank', value);
			return false;
		} else if ('min' in this.progProps && this.progProps.min !== undefined && value < this.progProps.min) {
			console.error('value is less then min', value);
			return false;
		} else if ('max' in this.progProps && this.progProps.max !== undefined && value > this.progProps.max) {
			console.error('value is greater then max', value);
			return false;
		} else {
			return true;
		}
	},
	change: function(e) {
		// TODO: i hope this only triggers when user changes - verify
		console.log('user changed field value in dom! this.value:', this.value, 'dom value:', ReactDOM.findDOMNode(this.refs.input).value);
		// update this.value, as this.value is to always be kept in sync with dom
		this.value = isNaN(this.value) ? ReactDOM.findDOMNode(this.refs.input).value : parseInt(ReactDOM.findDOMNode(this.refs.input).value);
		if (this.setValid()) {
			// update state
			this.progProps.dispatcher(this.value);
		}
	},
	wheel: function(e) {
		var newValue;
		console.log('e:', e.deltaMode, e.deltaY);
		if (e.deltaY < 0) {
			newValue = this.value + this.progProps.crement;
		} else {
			newValue = this.value - this.progProps.crement;
		}

		if (this.testValid(newValue)) {
			// update dom
			this.value = newValue;
			ReactDOM.findDOMNode(this.refs.input).value = this.value;
			console.error('ReactDOM.findDOMNode(this.refs.input):', ReactDOM.findDOMNode(this.refs.input));
			// update state
			this.progProps.dispatcher(this.value);
			// update dom error class
			this.setValid();
		} else {
			console.log('wheel calculated invalid value, so dont do anything, value:', newValue);
		}

		e.stopPropagation();
		e.preventDefault();
	},
	keydown: function(e) {
		var newValue;

		switch (e.key) {
			case 'ArrowUp':
					newValue = this.value + this.progProps.crement;
				break;
			case 'ArrowDown':
					newValue = this.value - this.progProps.crement;
				break;
			default:
				// if its not a number then block it
				if (e.key.length == 1) { // length test, so we allow special keys like Delete, Backspace, etc
					if (isNaN(e.key) || e.key == ' ') {
						console.log('blocked key:', '"' + e.key + '"');
						e.preventDefault();
					}
				}
				return;
		}

		if (this.testValid(newValue)) {
			// update dom
			this.value = newValue;
			ReactDOM.findDOMNode(this.refs.input).value = this.value;
			// update state
			this.progProps.dispatcher(this.value);
			// update dom error class
			this.setValid();
		} else {
			console.log('keydown calculated invalid value, so dont do anything, value:', newValue);
		}
	},
	mousedown: function(e) {
		if (e.button != 0) { return }

		if (e.target == ReactDOM.findDOMNode(this.refs.input)) { return } // as user is doing selection

		if (!this.testValid(this.value)) {
			console.log('dom value is currently invalid, so mousedown/mousemove will do nothing')
			return
		}

		this.down_allowed = true;

		this.downx = e.clientX;
		this.downval = this.value;

		this.downcover = document.createElement('div');
		this.downcover.setAttribute('id', 'inputnumber_cover');
		document.documentElement.appendChild(this.downcover);

		window.addEventListener('mouseup', this.mouseup, false);
		window.addEventListener('mousemove', this.mousemove, false);
	},
	mouseup: function(e) {
		if (e.button != 0) { return }

		window.removeEventListener('mouseup', this.mouseup, false);
		window.removeEventListener('mousemove', this.mousemove, false);

		this.downcover.parentNode.removeChild(this.downcover);

		delete this.downx;
		delete this.downval;
		delete this.downcover;
	},
	mousemove: function(e) {
		var delX = e.clientX - this.downx;

		var delSensitivity = delX / this.progProps.sensitivty;

		var newValue = this.downval + Math.round(delSensitivity * this.progProps.crement);

		// this block makes it hit min/max in case user moved mouse so fast the calc is less then the min/max
		if ('min' in this.progProps && this.progProps.min !== undefined && newValue < this.progProps.min) {
			if (this.value !== this.progProps.min) {
				newValue = this.progProps.min;
			}
		} else if ('max' in this.progProps && this.progProps.max !== undefined && newValue > this.progProps.max) {
			if (this.value !== this.progProps.max) {
				newValue = this.progProps.max;
			}
		}
		if (this.testValid(newValue)) {
			// update dom
			this.value = newValue;
			ReactDOM.findDOMNode(this.refs.input).value = this.value;
			// update state
			this.progProps.dispatcher(this.value);
			// update dom error class
			this.setValid();
			// update cover cursor
			if (!this.down_allowed) {
				this.down_allowed = true;
				this.downcover.classList.remove('not-allowed');
			}
		} else {
			// update cover cursor
			if (this.down_allowed) {
				this.down_allowed = false;
				this.downcover.classList.add('not-allowed');
			}
			console.log('mousemove calculated invalid value, so dont do anything, value:', newValue);
		}
	}
});

// REACT COMPONENTS - CONTAINER
var RowPrefContainer = ReactRedux.connect(
	function mapStateToProps(state, ownProps) {
		var value;
		switch (ownProps.name) {
			case 'autoupdate':
				value = state.addon_info.applyBackgroundUpdates;
				break;
			default:
				value = state.prefs[ownProps.name]
		}
		return {
			value
		};
	},
	function mapDispatchToProps(dispatch, ownProps) {
		return {
			setValue: newvalue=>dispatch(ownProps.setter ? ownProps.setter(newvalue) : setPref(ownProps.name, newvalue))
		};
	}
)(RowPref);

var RowsContainer = ReactRedux.connect(
	function mapStateToProps(state, ownProps) {
		return {
			recording: state.recording,
			hotkey: state.prefs.hotkey
		}
	}
)(Rows);

// ACTIONS
const SET_PREF = 'SET_PREF';
const SET_ADDON_INFO = 'SET_ADDON_INFO';
const SET_MAIN_KEYS = 'SET_MAIN_KEYS';

const START_RECORDING = 'START_RECORDING';
const CANCEL_RECORDING = 'CANCEL_RECORDING';
const MUTATE_RECORDING = 'MUTATE_RECORDING'; // no need for ACCEPT_RECORDING as when it mutates to include a name, it is accepted

// ACTION CREATORS
function setPref(pref, value) {
	return {
		type: SET_PREF,
		pref,
		value
	}
}
function setAddonInfo(value, info='applyBackgroundUpdates') {
	return {
		type: SET_ADDON_INFO,
		info,
		value
	}
}
function setMainKeys(obj_of_mainkeys) {
	Object.assign(hydrant_ex, obj_of_mainkeys);
	gSupressUpdateHydrantExOnce = true;
	return {
		type: SET_MAIN_KEYS,
		obj_of_mainkeys
	}
}

// function onRecordingKeyDown(e) {
// 	if (!e.repeat) {
// 		console.log('key down: "' + e.key + '"');
// 		if (e.key == 'Escape') {
// 			store.dispatch(cancelRecording());
// 		} else {
// 			store.dispatch(mutateRecording({alt:true}));
// 		}
// 	}
// 	else { console.warn('is key repeat') }
//
// 	e.preventDefault();
// 	e.stopPropagation();
// }
var gIsRecording = false;

function startRecordingBootstrapCallback(aArg) {
	var { __PROGRESS, recording } = aArg || {};
	// recording - only there when progress
	if (__PROGRESS) {
		console.log('got recording:', recording);
		store.dispatch(mutateRecording(recording));
	} else {
		store.dispatch(cancelRecording());
	}
}

function startRecording() {
	if (gIsRecording) {
		console.error('already recording!');
		return undefined;
	}
	gIsRecording = true;
	// window.addEventListener('keydown', onRecordingKeyDown, false);
	setTimeout(()=>document.activeElement.blur(), 0); // so it doesnt have the `:focus` styling on the button, but setTimeout because i want it to apply the `.active` styling as i set `value` of the `buttons` entry to `hotkey` so it lights up "Listening..."
	callInBootstrap('startRecording', undefined, startRecordingBootstrapCallback); // dispatch `cancelRecording` in case.

	var recording = { // matches the object structure of prefs.hotkey
		name: null,
		mods: null
		// {
			// alt: false,
			// control: false,
			// meta: false,
			// shift: false
		// }
	};
	return {
		type: START_RECORDING,
		recording
	}
}

function mutateRecording(recording) {
	return {
		type: MUTATE_RECORDING,
		recording
	}
}

function cancelRecording() {
	gIsRecording = false;
	// window.removeEventListener('keydown', onRecordingKeyDown, false);
	return {
		type: CANCEL_RECORDING
	}
}

// REDUCERS
function recording(state=null, action) {
	switch (action.type) {
		case START_RECORDING:
				return action.recording;
			break;
		case MUTATE_RECORDING:
				var { recording } = action;
				return recording;
			break;
		case CANCEL_RECORDING:
				return null;
			break;
		default:
			return state;
	}
}
function prefs(state=hydrant_ex.prefs, action) {
	switch (action.type) {
		case MUTATE_RECORDING:
				var { recording } = action;
				return recording.name ? Object.assign({}, state, { hotkey:recording }) : state; // see link01381 - when name is set it is "accepting the recording"
			break;
		case SET_PREF:
			var { pref, value } = action;
			return Object.assign({}, state, {
				[pref]: value
			});
		case SET_MAIN_KEYS:
			var { obj_of_mainkeys } = action;
			var mainkey = 'prefs';
			if (mainkey in obj_of_mainkeys) {
				console.error('yes updating state with new prefs');
			}
			return (mainkey in obj_of_mainkeys ? obj_of_mainkeys[mainkey] : state);
		default:
			return state;
	}
}
function addon_info(state=hydrant_ex.addon_info, action) {
	switch (action.type) {
		case SET_ADDON_INFO:
			var { info, value } = action;
			return Object.assign({}, state, {
				[info]: value
			});
		case SET_MAIN_KEYS:
			var { obj_of_mainkeys } = action;
			var mainkey = 'addon_info';
			return (mainkey in obj_of_mainkeys ? obj_of_mainkeys[mainkey] : state);
		default:
			return state;
	}
}

// `var` so app.js can access it
app = Redux.combineReducers({
	prefs,
	addon_info,
	recording
});

// end - react-redux
