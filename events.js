(function () {

const DATA = JSON.parse(document.getElementById('events-data').textContent);
const CALENDAR_MONTH = document.querySelector('.events-calendar-month');
const CALENDAR_DAYS = document.querySelector('.events-calendar-days');
const VIEWS = document.querySelectorAll('.view');
const BACKDROP = document.querySelector('.view-backdrop');
const MOBILE = window.matchMedia('(max-width: 900px)');
// the same feel as the entry overlay on the catalog
const SNAP_DURATION = 260; // how long the strip takes to settle onto a picture
const SNAP_DELAY = 140; // ms of stillness after a wheel before it settles
const FLICK_PROJECTION = 220; // ms of travel a flick is credited with before it settles
const FLICK_CEILING = 3; // px per ms, past which a stray reading is not believed

let opened = new Date();
let year = opened.getFullYear();
let month = opened.getMonth();
let strips = new Map();

function modulo(value, max) {
	return ((value % max) + max) % max;
}


/* calendar */

function stamp(year, month, day) {
	return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// the build already drew the opening month, this redraws it as the months are stepped
function drawCalendar() {
	CALENDAR_MONTH.textContent = `${DATA.months[month]} ${year}`.toUpperCase();

	let count = new Date(year, month + 1, 0).getDate();
	let days = document.createDocumentFragment();
	for (let day = 1; day <= count; day++) {
		let cell = document.createElement('span');
		cell.textContent = String(day).padStart(2, '0');
		cell.dataset.event = DATA.dates.includes(stamp(year, month, day)) ? '1' : '0';
		days.appendChild(cell);
	}
	CALENDAR_DAYS.replaceChildren(days);
}

function stepMonth(count) {
	month += count;
	while (month < 0) {
		month += 12;
		year--;
	}
	while (month > 11) {
		month -= 12;
		year++;
	}
	drawCalendar();
}


/* event view */

function stripFor(view) {
	if (!strips.has(view)) {
		let strip = view.querySelector('.view-strip');
		strips.set(view, {
			strip: strip,
			frame: view.querySelector('.view-images'),
			originals: [...strip.children].map(image => image.cloneNode(true)),
			offsets: [],
			width: 0,
			loops: false,
			pos: 0,
			snapTimeout: null,
			snapFrame: null
		});
	}
	return strips.get(view);
}

// which picture is sitting against the left edge right now
function nearestImage(state) {
	if (!state.offsets.length) {
		return 0;
	}
	let local = modulo(state.pos, state.width);
	let closest = 0;
	let closestDistance = Infinity;
	for (let i = 0; i < state.offsets.length; i++) {
		let distance = Math.abs(state.offsets[i] - local);
		if (distance < closestDistance) {
			closestDistance = distance;
			closest = i;
		}
	}
	return closest;
}

// copies are only added when the pictures are wider than the screen
function buildStrip(view) {
	let state = stripFor(view);
	stopSnap(state);
	// a resize changes every width, so the picture on show is remembered and returned to
	let keep = nearestImage(state);

	state.strip.replaceChildren(...state.originals.map(image => image.cloneNode(true)));

	// below the breakpoint the pictures stack down the page, so there is no strip to move
	if (MOBILE.matches) {
		state.strip.style.transform = '';
		state.offsets = [];
		state.loops = false;
		state.pos = 0;
		return;
	}

	let images = [...state.strip.children];
	if (!images.length) {
		return;
	}
	let base = state.strip.getBoundingClientRect().left;
	state.offsets = images.map(image => image.getBoundingClientRect().left - base);
	state.width = images[images.length - 1].getBoundingClientRect().right - base;

	let frameWidth = state.frame.clientWidth;
	state.loops = state.width > frameWidth;
	if (state.loops) {
		let copies = Math.ceil(frameWidth / state.width) + 1;
		for (let copy = 1; copy < copies; copy++) {
			for (let image of state.originals) {
				let clone = image.cloneNode(true);
				clone.setAttribute('aria-hidden', 'true');
				state.strip.appendChild(clone);
			}
		}
		state.pos = state.offsets[Math.min(keep, state.offsets.length - 1)];
	} else {
		state.pos = 0;
	}
	moveStrip(view);
}

function moveStrip(view) {
	let state = stripFor(view);
	if (state.loops) {
		state.pos = modulo(state.pos, state.width);
	}
	state.strip.style.transform = `translateX(${-state.pos}px)`;
	markLead(state);
}

// the picture edge nearest a position, carried into the next pass when that one is closer
function snapTarget(state, pos) {
	let local = modulo(pos, state.width);
	let edges = state.offsets.concat(state.width);
	let closest = edges[0];
	for (let edge of edges) {
		if (Math.abs(edge - local) < Math.abs(closest - local)) {
			closest = edge;
		}
	}
	return pos - local + closest;
}

function stopSnap(state) {
	clearTimeout(state.snapTimeout);
	if (state.snapFrame != null) {
		cancelAnimationFrame(state.snapFrame);
		state.snapFrame = null;
	}
}

// eases the strip onto a position, so it is never left sitting between two pictures
function glideStrip(view, target) {
	let state = stripFor(view);
	stopSnap(state);
	let start = state.pos;
	let time = performance.now();
	let frame = () => {
		let progress = Math.min(1, (performance.now() - time) / SNAP_DURATION);
		let eased = 1 - Math.pow(1 - progress, 3);
		state.pos = start + (target - start) * eased;
		state.strip.style.transform = `translateX(${-state.pos}px)`;
		if (progress >= 1) {
			state.snapFrame = null;
			moveStrip(view); // wraps the number back into a single pass
			return;
		}
		state.snapFrame = requestAnimationFrame(frame);
	};
	state.snapFrame = requestAnimationFrame(frame);
}

function snapStrip(view, speed) {
	let state = stripFor(view);
	if (!state.loops) {
		return;
	}
	let target = snapTarget(state, state.pos + (speed || 0) * FLICK_PROJECTION);
	if (Math.abs(target - state.pos) < 0.5) {
		return;
	}
	glideStrip(view, target);
}

// whichever picture has come to rest against the left edge stands its own rule down, so it is not
// drawn against the border of the panel
function markLead(state) {
	let edge = state.frame.getBoundingClientRect().left;
	for (let image of state.strip.children) {
		image.dataset.lead = Math.abs(image.getBoundingClientRect().left - edge) < 1 ? '1' : '0';
	}
}

// steps a picture at a time, wrapping both ways. when they all fit there is nothing to scroll, so the order rotates instead
function stepStrip(view, count) {
	let state = stripFor(view);
	if (!state.originals.length) {
		return;
	}
	stopSnap(state);

	if (!state.loops) {
		for (let i = 0; i < Math.abs(count); i++) {
			if (count > 0) {
				state.originals.push(state.originals.shift());
			} else {
				state.originals.unshift(state.originals.pop());
			}
		}
		buildStrip(view);
		return;
	}

	let target = nearestImage(state) + count;
	let laps = Math.floor(target / state.offsets.length);
	state.pos = laps * state.width + state.offsets[modulo(target, state.offsets.length)];
	moveStrip(view);
}

function activeView() {
	for (let view of VIEWS) {
		if (view.dataset.active == '1') {
			return view;
		}
	}
	return null;
}

function updateUrl() {
	let view = activeView();
	history.replaceState(null, '', view ? `?event=${encodeURIComponent(view.dataset.view)}` : location.pathname);
}

// passing nothing closes whatever is open
function showView(name) {
	for (let view of VIEWS) {
		view.dataset.active = view.dataset.view == name ? '1' : '0';
	}
	BACKDROP.dataset.active = name ? '1' : '0';

	// measured only once it is on screen
	let view = activeView();
	if (view) {
		buildStrip(view);
	}
	updateUrl();
}


/* events */

document.querySelector('.events-prev').addEventListener('click', (event) => {
	event.preventDefault();
	stepMonth(-1);
});
document.querySelector('.events-next').addEventListener('click', (event) => {
	event.preventDefault();
	stepMonth(1);
});

// read More opens the description below the blurb and becomes Read Less
for (let toggle of document.querySelectorAll('.events-toggle')) {
	toggle.addEventListener('click', (event) => {
		event.preventDefault();
		let block = toggle.closest('.events-event');
		block.dataset.active = block.dataset.active == '1' ? '0' : '1';
	});
}

for (let button of document.querySelectorAll('.events-view')) {
	button.addEventListener('click', (event) => {
		event.preventDefault();
		showView(button.dataset.view);
	});
}

// a picture opens its event's view, or unfolds the description when the event has no view
for (let link of document.querySelectorAll('.events-thumb-link')) {
	link.addEventListener('click', (event) => {
		event.preventDefault();
		if (link.dataset.view) {
			showView(link.dataset.view);
		} else {
			link.closest('.events-event').dataset.active = '1';
		}
	});
}

for (let view of VIEWS) {
	view.querySelector('.view-close').addEventListener('click', (event) => {
		event.preventDefault();
		showView();
	});
	view.querySelector('.view-prev').addEventListener('click', (event) => {
		event.preventDefault();
		stepStrip(view, -1);
	});
	view.querySelector('.view-next').addEventListener('click', (event) => {
		event.preventDefault();
		stepStrip(view, 1);
	});

	// above the breakpoint the strip scrolls sideways under a trackpad or wheel, and follows a finger
	// dragged across it, settling on a picture once the input stops
	let frame = view.querySelector('.view-images');
	frame.addEventListener('wheel', (event) => {
		let state = stripFor(view);
		if (MOBILE.matches || !state.loops) {
			return;
		}
		event.preventDefault();
		// a trackpad swipe reads across, a wheel reads down, and either moves the strip
		let delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
		if (event.deltaMode == 1) {
			delta *= 40; // counted in lines rather than pixels
		} else if (event.deltaMode == 2) {
			delta *= frame.clientWidth;
		}
		stopSnap(state);
		state.pos += delta;
		moveStrip(view);
		state.snapTimeout = setTimeout(() => snapStrip(view), SNAP_DELAY);
	}, { passive: false });

	let drag = null;
	frame.addEventListener('pointerdown', (event) => {
		if (event.pointerType != 'mouse' && !MOBILE.matches && stripFor(view).loops) {
			stopSnap(stripFor(view));
			drag = {x: event.clientX, time: performance.now(), speed: 0};
			frame.setPointerCapture(event.pointerId);
		}
	});
	frame.addEventListener('pointermove', (event) => {
		if (!drag) {
			return;
		}
		let state = stripFor(view);
		let along = drag.x - event.clientX;
		let now = performance.now();
		let step = now - drag.time;
		if (step > 0) {
			drag.speed = Math.max(-FLICK_CEILING, Math.min(FLICK_CEILING, along / step));
		}
		drag.x = event.clientX;
		drag.time = now;
		state.pos += along;
		moveStrip(view);
	});
	for (let type of ['pointerup', 'pointercancel']) {
		frame.addEventListener(type, () => {
			if (!drag) {
				return;
			}
			// held still before letting go, it settles where it is rather than being flung
			let speed = performance.now() - drag.time > 80 ? 0 : drag.speed;
			drag = null;
			snapStrip(view, speed);
		});
	}

	let toggle = view.querySelector('.view-info-toggle');
	if (toggle) {
		toggle.addEventListener('click', (event) => {
			event.preventDefault();
			let row = toggle.closest('.view-expand');
			row.dataset.active = row.dataset.active == '1' ? '0' : '1';
		});
	}
}

BACKDROP.addEventListener('click', () => {
	showView();
});

window.addEventListener('keydown', (event) => {
	let view = activeView();
	if (!view) {
		return;
	}
	if (event.key == 'Escape') {
		showView();
	} else if (event.key == 'ArrowLeft') {
		stepStrip(view, -1);
	} else if (event.key == 'ArrowRight') {
		stepStrip(view, 1);
	} else {
		return;
	}
	event.preventDefault();
});

let openedEvent = new URLSearchParams(location.search).get('event');
if (openedEvent) {
	showView(openedEvent);
}

let resizeTimeout = null;
window.addEventListener('resize', () => {
	clearTimeout(resizeTimeout);
	resizeTimeout = setTimeout(() => {
		let view = activeView();
		if (view) {
			buildStrip(view);
		}
	}, 150);
});

// crossing the breakpoint swaps a filmstrip for a stack, so the pictures are laid out again
MOBILE.addEventListener('change', () => {
	let view = activeView();
	if (view) {
		buildStrip(view);
	}
});

})();
