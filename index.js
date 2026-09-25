(function () {

// scroll settings
const WHEEL_THRESHOLD = 60;
const STEP_DURATION = 40;
const STEP_COOLDOWN = 60;
const IDLE_RESET = 180;
const STACK_COUNT = 4; // needs to be at least 3 so scrollTop never clamps
const IMAGE_STACKS = 3; // a column holds the whole archive, so it carries the fewest copies that still loop
const SEAM_SLACK = 1; // a browser keeps a scroll position to a fraction of a pixel, and the seam is not to be tripped by one

// sort settings
const SORT_DESCENDING = ' ⌄';
const SORT_ASCENDING = ' ^';

const IMAGE_COLUMNS = 2;
const IMAGE_COLUMNS_WIDE = 3;
const WIDE = window.matchMedia('(min-width: 1501px)'); // where a third column fits
const DEFAULT_SORT = 4; // date received, newest first
const MOBILE = window.matchMedia('(max-width: 900px)');
const GLIDE_FRICTION = 0.95; // how much of its speed a glide keeps every 16ms
const GLIDE_MINIMUM = 0.02; // px per ms, below which it settles on a row
const GLIDE_WINDOW = 100; // ms at the end of a drag that decide how fast it was let go
const GLIDE_HOLD = 80; // ms of stillness before letting go that calls the glide off

// entry overlay settings
const ZOOMS = [1, 2, 4];
const SNAP_DURATION = 260; // how long the strip takes to settle onto a picture
const SNAP_DELAY = 140; // ms of stillness after a wheel before it settles
const FLICK_PROJECTION = 220; // ms of travel a flick is credited with before it settles
const FLICK_CEILING = 3; // px per ms, past which a stray reading is not believed
const PINCH_IN = 1.25; // how far the fingers must spread to buy a zoom level
const PINCH_OUT = 0.8;

const LIST = document.querySelector('.index-list');
const LIST_LINKS = document.querySelector('.index-list-links');
const LIST_HEADINGS = document.querySelectorAll('.index-list-heading:not(.index-select)');
const LIST_GRIDLINES = document.querySelector('.index-list-gridlines');
const IMAGES = document.querySelector('.index-images');
const IMAGES_GRIDLINES = document.querySelector('.index-images-gridlines');
const PREVIEW = document.querySelector('.index-preview');
const PREVIEW_IMAGE = document.querySelector('.index-preview-image');
const VIEW_TOGGLES = document.querySelectorAll('.index-view');
const SHUFFLE = document.querySelector('.index-shuffle');
const SORT = document.querySelector('.index-sort');
const HEADING_LABELS = [...LIST_HEADINGS].map(heading => heading.dataset.label);
const HEADING_SHORTS = [...LIST_HEADINGS].map(heading => heading.dataset.short);

const ENTRY = document.querySelector('.entry');
const BACKDROP = document.querySelector('.entry-backdrop');
const ENTRY_DATA = JSON.parse(document.getElementById('archive-data').textContent);
const ENTRY_CLOSE = document.querySelector('.entry-close');
const ENTRY_CODE = document.querySelector('.entry-code');
const ENTRY_DOWNLOAD = document.querySelector('.entry-download');
const ENTRY_TEXT = document.querySelector('.entry-text');
const ENTRY_NAME = document.querySelector('.entry-name');
const ENTRY_PLACE = document.querySelector('.entry-place');
const ENTRY_TYPE = document.querySelector('.entry-type');
const ENTRY_DATE = document.querySelector('.entry-date');
const ENTRY_COUNT = document.querySelector('.entry-count');
const ENTRY_MEDIA = document.querySelector('.entry-media');
const ENTRY_TRACK = document.querySelector('.entry-track');
const SLIDE_TEMPLATE = document.getElementById('entry-slide');

let view = 'list';
let viewNamed = false; // whether the url spells the view out, even when it is the list

let originalRows = [...LIST_LINKS.children].map(row => row.cloneNode(true));
let activeEntry = null; // tracked by node so it survives sorting
let sortedColumn = -1;
let isAscending = false;

let rowOffsets = []; // top of every row within one stack
let stackHeight = 0;
let scrollPos = 0;
let targetPos = 0;
let startPos = 0;
let startTime = 0;
let animationFrame = null;
let scrollAccum = 0;
let prevInputTime = 0;
let prevStepTime = 0;
let prevViewHeight = 0;
let isBuilding = false;
let velocity = 0;
let glideFrame = null;
let glideTime = 0;
let touchTime = 0;
let samples = []; // where the finger was, and when, across the tail of a drag

let originalImages = [...IMAGES.children].map(image => image.cloneNode(true));
let activeImage = null; // tracked by node so it survives shuffling
let columns = [];
let imageOffsets = []; // top of every picture within one copy of the archive
let imageCopy = 0; // how tall one copy of it stands
let imageStack = 0; // and the run of copies a column loops on
let isBuildingImages = false;
let imageRepeats = 0; // how many copies of the archive a stack is made of
let hasShuffled = false;

let openEntry = -1;
let openImage = 0;
let zoomLevel = 0;

let entryImages = [];
let slideOffsets = []; // where each picture starts within one pass of the strip
let stripWidth = 0;
let trackWidth = 0; // the column width the strip was laid out against
let trackPos = 0;
let trackStart = 0;
let trackTarget = 0;
let trackTime = 0;
let trackFrame = null;
let snapTimeout = null;
let entryTouch = null;
let panMouse = null;

// below the breakpoint only one column shows at a time, and this picks which
function setColumn(index) {
	LIST.dataset.column = index;
	for (let option of document.querySelectorAll('.index-sort-option')) {
		option.dataset.active = option.dataset.column == String(index) ? '1' : '0';
	}
}

function setSortMenu(open) {
	SORT.dataset.active = open ? '1' : '0';
	LIST.dataset.selecting = open ? '1' : '0';
}

function modulo(value, max) {
	return ((value % max) + max) % max;
}


/* list view */

// only the first pass of the rows is the real one, the rest are repeats of it
function rowClone(index, hidden) {
	let clone = originalRows[index].cloneNode(true);
	clone.dataset.row = index;
	clone.dataset.active = originalRows[index] == activeEntry ? '1' : '0';
	if (hidden) {
		clone.setAttribute('aria-hidden', 'true');
		clone.setAttribute('tabindex', '-1');
	}
	return clone;
}

// stack identical copies of the rows so scrolling can loop forever
function renderStacks(copies) {
	let stacks = document.createDocumentFragment();
	for (let i = 0; i < copies; i++) {
		for (let j = 0; j < originalRows.length; j++) {
			stacks.appendChild(rowClone(j, i > 0));
		}
	}
	LIST_LINKS.replaceChildren(stacks);
}


// rects instead of offsetTop, which rounds to whole pixels and drifts over a stack
function measureRowTops(count) {
	let rows = LIST_LINKS.children;
	let base = rows[0].getBoundingClientRect().top;
	let tops = [];
	for (let i = 0; i < count; i++) {
		tops.push(rows[i].getBoundingClientRect().top - base);
	}
	return tops;
}

// how far a row sits below the first one, taken from the layout rather than counted
function rowDistance(index) {
	let rows = LIST_LINKS.children;
	return rows[index].getBoundingClientRect().top - rows[0].getBoundingClientRect().top;
}

function build(resetToTop) {
	if (!originalRows.length) {
		return;
	}
	isBuilding = true;

	// a rebuild throws away the two positions the animation is running between
	if (animationFrame != null) {
		cancelAnimationFrame(animationFrame);
		animationFrame = null;
	}

	let keepRow = rowOffsets.length && !resetToTop ? nearestRow(modulo(targetPos, stackHeight)) : 0;
	let rowCount = originalRows.length;
	let viewHeight = LIST_LINKS.clientHeight;
	prevViewHeight = viewHeight;

	// back to the top before the rows are replaced, so the old position is never clamped against a shorter list
	LIST_LINKS.scrollTop = 0;

	// two copies first, so one copy's height reads as the gap between the two first rows
	renderStacks(2);
	let rowTops = measureRowTops(rowCount + 1);
	let copyHeight = rowTops[rowCount];
	if (!copyHeight) {
		isBuilding = false;
		return;
	}

	// repeat the rows until a single stack is taller than the visible area
	let repeats = Math.max(1, Math.ceil(viewHeight / copyHeight));
	stackHeight = copyHeight * repeats;

	rowOffsets = [];
	for (let i = 0; i < repeats; i++) {
		for (let j = 0; j < rowCount; j++) {
			rowOffsets.push(i * copyHeight + rowTops[j]);
		}
	}

	renderStacks(repeats * STACK_COUNT);

	// park in the middle stack on whichever row was on top, measured where it landed rather than counted in copies
	let row = Math.min(keepRow, rowOffsets.length - 1);
	scrollPos = targetPos = startPos = rowDistance(rowOffsets.length + row);
	LIST_LINKS.scrollTop = scrollPos;
	scrollAccum = 0;

	isBuilding = false;
}

// the seam at stackHeight counts as a row top, it's row 0 of the next stack
function nearestRow(localPos) {
	let closest = 0;
	let closestDistance = Infinity;
	for (let i = 0; i < rowOffsets.length; i++) {
		let distance = Math.abs(rowOffsets[i] - localPos);
		if (distance < closestDistance) {
			closestDistance = distance;
			closest = i;
		}
	}
	if (Math.abs(stackHeight - localPos) < closestDistance) {
		return rowOffsets.length;
	}
	return closest;
}

function snapPos(pos) {
	let localPos = modulo(pos, stackHeight);
	let row = nearestRow(localPos);
	let offset = row == rowOffsets.length ? stackHeight : rowOffsets[row];
	return pos - localPos + offset;
}

// every move ends on a row top, so the list is never left sitting between rows
function moveTo(pos) {
	startPos = scrollPos;
	targetPos = pos;
	startTime = performance.now();
	if (animationFrame == null) {
		animationFrame = requestAnimationFrame(animate);
	}
}

// row numbers run past the end of a stack, and carry into the next one
function rowPos(row) {
	let stacks = Math.floor(row / rowOffsets.length);
	return stacks * stackHeight + rowOffsets[modulo(row, rowOffsets.length)];
}

function stepRows(count) {
	let localPos = modulo(targetPos, stackHeight);
	let stackStart = targetPos - localPos;
	moveTo(stackStart + rowPos(nearestRow(localPos) + count));
}

// the height of the row about to arrive, so a drag covers exactly the distance it moves the list
function rowStep(direction) {
	let row = nearestRow(modulo(targetPos, stackHeight));
	return Math.abs(rowPos(row + direction) - rowPos(row));
}

function pageRows(direction) {
	moveTo(snapPos(targetPos + direction * LIST_LINKS.clientHeight));
}

// every stack is identical, so shifting by one changes nothing on screen
function wrapScroll() {
	while (scrollPos >= stackHeight * 2) {
		scrollPos -= stackHeight;
		startPos -= stackHeight;
		targetPos -= stackHeight;
	}
	while (scrollPos < stackHeight) {
		scrollPos += stackHeight;
		startPos += stackHeight;
		targetPos += stackHeight;
	}
}

function animate() {
	let progress = Math.min(1, (performance.now() - startTime) / STEP_DURATION);
	scrollPos = startPos + (targetPos - startPos) * progress;
	if (progress >= 1) {
		scrollPos = targetPos;
		animationFrame = null;
	} else {
		animationFrame = requestAnimationFrame(animate);
	}
	wrapScroll();
	LIST_LINKS.scrollTop = scrollPos;
}

// put the list at a position outright, wrapping so it never reaches either end
function setPos(pos) {
	scrollPos = targetPos = startPos = pos;
	wrapScroll();
	LIST_LINKS.scrollTop = scrollPos;
}

function stopGlide() {
	if (glideFrame != null) {
		cancelAnimationFrame(glideFrame);
		glideFrame = null;
	}
	if (animationFrame != null) {
		cancelAnimationFrame(animationFrame);
		animationFrame = null;
	}
}

// a drag carries on after the finger leaves and slows to a stop, then settles on a row
function glide() {
	let now = performance.now();
	let step = Math.min(now - glideTime, 32);
	glideTime = now;
	velocity *= Math.pow(GLIDE_FRICTION, step / 16);

	if (Math.abs(velocity) < GLIDE_MINIMUM) {
		glideFrame = null;
		moveTo(snapPos(targetPos));
		return;
	}
	setPos(scrollPos + velocity * step);
	glideFrame = requestAnimationFrame(glide);
}

// spend input a row at a time, holding anything extra at one row's worth so a flick cannot buy a run of steps. a threshold of 0 measures it off the row instead
function ratchet(delta, threshold) {
	if (!rowOffsets.length) {
		return;
	}

	let time = performance.now();
	if (time - prevInputTime > IDLE_RESET) {
		scrollAccum = 0;
	}
	prevInputTime = time;

	scrollAccum += delta;
	if (!scrollAccum) {
		return;
	}

	let direction = Math.sign(scrollAccum);
	let step = threshold || rowStep(direction);
	if (Math.abs(scrollAccum) < step) {
		return;
	}

	// a drag carries no momentum of its own, so it has no run to be held back from
	if (threshold && time - prevStepTime < STEP_COOLDOWN) {
		scrollAccum = direction * step;
		return;
	}

	scrollAccum -= direction * step;
	if (Math.abs(scrollAccum) > step) {
		scrollAccum = direction * step;
	}
	prevStepTime = time;
	stepRows(direction);
}


/* sorting */

// dates are written out in the page language, so they carry a raw value to sort on
function cellValue(row, column) {
	let cell = row.children[column];
	return (cell.dataset.sort || cell.textContent).trim();
}

// a column whose entries read differently on their own carries both labels, and the stylesheet picks between them
function headingLabel(index) {
	if (HEADING_SHORTS[index] == HEADING_LABELS[index]) {
		return `[${HEADING_LABELS[index]}]`;
	}
	return `<span class="index-heading-full">[${HEADING_LABELS[index]}]</span><span class="index-heading-short">[${HEADING_SHORTS[index]}]</span>`;
}

function isNumeric(value) {
	return value != '' && !isNaN(value);
}

// numbers and dates sort by value, everything else alphabetically
function compareCells(a, b) {
	if (isNumeric(a) && isNumeric(b)) {
		return a - b;
	}
	let dateA = Date.parse(a);
	let dateB = Date.parse(b);
	if (!isNaN(dateA) && !isNaN(dateB)) {
		return dateA - dateB;
	}
	return a.localeCompare(b, undefined, {numeric: true});
}

function sortByColumn(column) {
	if (column == sortedColumn) {
		isAscending = !isAscending;
	} else {
		sortedColumn = column;
		isAscending = false;
	}

	let order = isAscending ? 1 : -1;
	originalRows.sort((rowA, rowB) => {
		return compareCells(cellValue(rowA, column), cellValue(rowB, column)) * order;
	});

	for (let i = 0; i < LIST_HEADINGS.length; i++) {
		let label = headingLabel(i);
		if (i == sortedColumn) {
			label += isAscending ? SORT_ASCENDING : SORT_DESCENDING;
		}
		LIST_HEADINGS[i].innerHTML = label;
	}

	build(true);
}


/* preview */

// the last hovered entry stays lit, and every copy of it in the stacks does too
// every row's thumbnail, loaded once and kept, so the preview can show one the moment its row is
// pointed at instead of waiting on it
const thumbnails = new Map();
function thumbnailImage(src) {
	if (!thumbnails.has(src)) {
		let image = new Image();
		image.decoding = 'async';
		image.src = src;
		thumbnails.set(src, image);
	}
	return thumbnails.get(src);
}

// only a pointer can hover, so only a pointer is worth loading them all ahead for
function preloadThumbnails() {
	if (!window.matchMedia('(hover: hover)').matches) {
		return;
	}
	for (let row of originalRows) {
		if (row.dataset.thumbnail) {
			thumbnailImage(row.dataset.thumbnail);
		}
	}
}

function showPreview(entry) {
	let thumbnail = entry.dataset.thumbnail;
	PREVIEW.dataset.tint = entry.dataset.tint;
	PREVIEW.style.setProperty('--preview-ratio', entry.dataset.ratio || 1);
	PREVIEW.style.setProperty('--tint', `url("${thumbnail}")`);
	if (PREVIEW_IMAGE.getAttribute('src') != thumbnail) {
		PREVIEW_IMAGE.setAttribute('src', thumbnail);
	}
	PREVIEW.dataset.active = '1';
}

function setActiveEntry(entry) {
	// the pointer crosses the spans inside a row, and each crossing asks again for the same row
	if (entry == activeEntry) {
		return;
	}
	activeEntry = entry;
	for (let row of LIST_LINKS.children) {
		row.dataset.active = originalRows[row.dataset.row] == activeEntry ? '1' : '0';
	}

	let thumbnail = activeEntry ? activeEntry.dataset.thumbnail : '';
	if (!thumbnail) {
		PREVIEW.dataset.active = '0';
		return;
	}
	// a picture still on its way would leave the last one standing in the new row's frame, so the
	// preview waits for it, and only shows it if the pointer is still on that row by then
	let image = thumbnailImage(thumbnail);
	if (image.complete && image.naturalWidth) {
		showPreview(activeEntry);
		return;
	}
	PREVIEW.dataset.active = '0';
	image.decode().catch(() => {}).then(() => {
		if (activeEntry == entry) {
			showPreview(entry);
		}
	});
}


/* image view */

// every copy of an item carries the hover state, so it reads the same wherever it turns up
function imageClone(index, repeat) {
	let clone = originalImages[index].cloneNode(true);
	clone.dataset.image = index;
	clone.dataset.active = originalImages[index] == activeImage ? '1' : '0';
	if (repeat) {
		clone.setAttribute('aria-hidden', 'true');
		clone.setAttribute('tabindex', '-1');
	}
	return clone;
}

function setActiveImage(image) {
	activeImage = image;
	for (let item of IMAGES.querySelectorAll('.index-image')) {
		item.dataset.active = originalImages[item.dataset.image] == activeImage ? '1' : '0';
	}
}

// every column holds the whole archive, so only the first pass down the first column is the real
// one: everything after it is a repeat, and is kept out of the way of anything reading the page
function imageStacks(copies, repeat) {
	let stacks = document.createDocumentFragment();
	for (let i = 0; i < copies; i++) {
		for (let j = 0; j < originalImages.length; j++) {
			stacks.appendChild(imageClone(j, repeat || i > 0));
		}
	}
	return stacks;
}

// rects instead of offsetTop, which rounds to whole pixels and drifts over a stack
function measureImageTops(column, count) {
	let items = column.children;
	let base = items[0].getBoundingClientRect().top;
	let tops = [];
	for (let i = 0; i < count; i++) {
		tops.push(items[i].getBoundingClientRect().top - base);
	}
	return tops;
}

// no column opens flush with the top of a picture: of three, the second opens a third of the way
// into the one it lands on and the third two thirds of the way into its own
function imageNudge(share, column) {
	if (!column) {
		return 0;
	}
	let next = share + 1 < imageOffsets.length ? imageOffsets[share + 1] : imageCopy;
	return (next - imageOffsets[share]) * column / columns.length;
}

// every column carries the whole archive and scrolls on its own, each opening its own share of the
// way into it. the copies above and below that opening hold the same pictures again, so a column
// can be scrolled either way without ever coming to an end
function buildImages() {
	if (!originalImages.length) {
		return;
	}

	let wanted = MOBILE.matches ? 1 : (WIDE.matches ? IMAGE_COLUMNS_WIDE : IMAGE_COLUMNS);
	if (columns.length != wanted) {
		columns = [];
		for (let i = 0; i < wanted; i++) {
			let column = document.createElement('div');
			column.className = 'index-images-column';
			column.addEventListener('scroll', () => wrapColumn(column));
			columns.push(column);
		}
		IMAGES.replaceChildren(...columns);
		imageRepeats = 0;
	}

	isBuildingImages = true;

	// below the breakpoint there is one column, the view scrolls it, and it is added to as it is
	// reached rather than looped, so the pictures start where the archive does
	if (MOBILE.matches) {
		imageStack = 0;
		imageRepeats = 0;
		columns[0].replaceChildren(imageStacks(1, false));
		IMAGES.scrollTop = 0;
		isBuildingImages = false;
		return;
	}

	let count = originalImages.length;
	let viewHeight = IMAGES.clientHeight;

	// a resize changes how tall the pictures are but not which ones they are, so the column measures
	// itself where it stands. only a column with nothing in it yet is laid out to be measured: one
	// copy, and the first picture over again after it, so that picture's top reads as a copy's height
	if (columns[0].children.length < count + 1) {
		columns[0].scrollTop = 0;
		let measure = imageStacks(1, false);
		measure.appendChild(imageClone(0, true));
		columns[0].replaceChildren(measure);
	}
	let tops = measureImageTops(columns[0], count + 1);
	imageCopy = tops[count];
	if (!imageCopy) {
		isBuildingImages = false;
		return;
	}
	imageOffsets = tops.slice(0, count);

	// repeat the pictures until a single stack is taller than the column
	let repeats = Math.max(1, Math.ceil(viewHeight / imageCopy));
	imageStack = imageCopy * repeats;

	// the pictures are only stamped out again when there are not already the right number of them,
	// which a resize on its own never changes
	let wantedCards = count * repeats * IMAGE_STACKS;
	if (repeats != imageRepeats || columns.some(column => column.children.length != wantedCards)) {
		imageRepeats = repeats;
		let stacks = imageStacks(repeats * IMAGE_STACKS, true);
		for (let column of columns) {
			column.scrollTop = 0;
			column.replaceChildren(stacks.cloneNode(true));
		}
		// the first pass down the first column is the real one, and the only one anything reads
		for (let n = 0; n < count; n++) {
			columns[0].children[n].removeAttribute('aria-hidden');
			columns[0].children[n].removeAttribute('tabindex');
		}
	}

	for (let i = 0; i < columns.length; i++) {
		// park in the middle stack, a share of the way into the archive and a part of a picture past that
		let share = Math.round(count * i / columns.length) % count;
		columns[i].scrollTop = imageStack + imageOffsets[share] + imageNudge(share, i);
	}

	isBuildingImages = false;
}

// the middle stack is the one being looked at and the stacks either side of it hold the same
// pictures again, so crossing into one puts the column back a stack and nothing is seen to move
function wrapColumn(column) {
	if (isBuildingImages || !imageStack) {
		return;
	}
	let pos = column.scrollTop;
	while (pos >= imageStack * 2 + SEAM_SLACK) {
		pos -= imageStack;
	}
	while (pos < imageStack - SEAM_SLACK) {
		pos += imageStack;
	}
	if (pos != column.scrollTop) {
		column.scrollTop = pos;
	}
}

// a resize changes how tall the pictures are, not which ones they are: the loop is measured again
// where it stands, and nothing is built and nothing is moved. only a column count that has changed
// sends the pictures back to buildImages, and that comes from the breakpoints rather than from here
function measureImages() {
	let count = originalImages.length;
	if (MOBILE.matches || !columns.length || !count || columns[0].children.length < count + 1) {
		return;
	}
	let tops = measureImageTops(columns[0], count + 1);
	if (!tops[count]) {
		return;
	}
	imageCopy = tops[count];
	imageOffsets = tops.slice(0, count);

	// a copy is taller than the screen many times over, so this only ever comes out at one. it is
	// checked all the same, since a stack that no longer covers the column would not loop
	if (Math.max(1, Math.ceil(IMAGES.clientHeight / imageCopy)) != imageRepeats) {
		buildImages();
		return;
	}
	imageStack = imageCopy * imageRepeats;
	// the middle stack has moved under the columns, so they are walked back into it. every stack
	// holds the same pictures, so there is nothing to see in the move
	for (let column of columns) {
		wrapColumn(column);
	}
}

// below the breakpoint the view scrolls itself, so the strip grows as it is reached and never runs out
function extendImages() {
	if (!MOBILE.matches || !columns.length || !originalImages.length) {
		return;
	}
	if (IMAGES.scrollTop + IMAGES.clientHeight * 2 < IMAGES.scrollHeight) {
		return;
	}
	for (let index = 0; index < originalImages.length; index++) {
		columns[0].appendChild(imageClone(index, true));
	}
}

function shuffleImages() {
	for (let i = originalImages.length - 1; i > 0; i--) {
		let j = Math.floor(Math.random() * (i + 1));
		let held = originalImages[i];
		originalImages[i] = originalImages[j];
		originalImages[j] = held;
	}
	imageRepeats = 0;
	buildImages();
}

/* entry overlay */

function isEntryOpen() {
	return ENTRY.dataset.active == '1';
}

// below the breakpoint the strip stands on end and is swiped up and down instead of across
function trackVertical() {
	return MOBILE.matches;
}

// how far along the strip the column can see, which is what decides how many passes it needs
function mediaLength() {
	return trackVertical() ? ENTRY_MEDIA.clientHeight : ENTRY_MEDIA.clientWidth;
}

// the column the strip runs through, published so a picture knows how much room it may take
function measureEntry() {
	let width = ENTRY_MEDIA.clientWidth;
	if (width) {
		ENTRY.style.setProperty('--media-width', width + 'px');
	}
	let depth = ENTRY_MEDIA.clientHeight;
	if (depth) {
		ENTRY.style.setProperty('--media-height', depth + 'px');
	}
	// below the breakpoint the picture stops above this text, whose height a long name can grow
	let height = ENTRY_TEXT.offsetHeight;
	if (height) {
		ENTRY.style.setProperty('--entry-text', height + 'px');
	}
}

// one picture in the strip. the frame is sized by aspect ratio, so it is exactly the picture
// and the zoom controls have an edge to sit on
function slideElement(image) {
	let slide = SLIDE_TEMPLATE.content.firstElementChild.cloneNode(true);
	slide.style.setProperty('--ratio', image.height ? image.width / image.height : 1);

	// a tinted picture reads as paper, and it masks the tint to its own edges
	let frame = slide.querySelector('.entry-frame');
	frame.dataset.tint = image.tint ? '1' : '0';
	frame.style.setProperty('--tint', `url("${image.src}")`);

	slide.querySelector('.entry-photo').setAttribute('src', image.src);
	return slide;
}

function stripElements() {
	let strip = document.createDocumentFragment();
	for (let image of entryImages) {
		strip.appendChild(slideElement(image));
	}
	return strip;
}

// lay the pictures out once to measure them, then repeat that pass until the column is covered
// wherever the strip happens to sit, so it can be moved forever without running out
function buildTrack() {
	slideOffsets = [];
	stripWidth = 0;
	if (!entryImages.length) {
		ENTRY_TRACK.replaceChildren();
		return;
	}

	measureEntry();
	trackWidth = mediaLength();
	ENTRY_TRACK.style.transform = 'translate(0px, 0px)';
	ENTRY_TRACK.replaceChildren(stripElements());

	let vertical = trackVertical();
	let slides = ENTRY_TRACK.children;
	// rects rather than offsetLeft, which rounds to whole pixels and drifts across a pass
	let base = slides[0].getBoundingClientRect();
	for (let slide of slides) {
		let rect = slide.getBoundingClientRect();
		slideOffsets.push(vertical ? rect.top - base.top : rect.left - base.left);
	}
	let last = slides[slides.length - 1].getBoundingClientRect();
	stripWidth = vertical ? last.bottom - base.top : last.right - base.left;
	if (!stripWidth || entryImages.length < 2) {
		return;
	}

	let copies = Math.ceil(mediaLength() / stripWidth) + 1;
	for (let copy = 1; copy < copies; copy++) {
		ENTRY_TRACK.appendChild(stripElements());
	}

	// only the first pass is the real one, the rest are repeats of it
	for (let i = entryImages.length; i < ENTRY_TRACK.children.length; i++) {
		ENTRY_TRACK.children[i].setAttribute('aria-hidden', 'true');
	}
}

// every pass is identical, so showing the strip from its remainder shows the same thing
function setTrackPos(pos) {
	trackPos = pos;
	if (!stripWidth) {
		return;
	}
	let offset = -modulo(trackPos, stripWidth);
	ENTRY_TRACK.style.transform = trackVertical() ? `translateY(${offset}px)` : `translateX(${offset}px)`;
}

// the seam at stripWidth counts as a picture edge, it's the first picture of the next pass
function nearestSlide(localPos) {
	let closest = 0;
	let closestDistance = Infinity;
	for (let i = 0; i < slideOffsets.length; i++) {
		let distance = Math.abs(slideOffsets[i] - localPos);
		if (distance < closestDistance) {
			closestDistance = distance;
			closest = i;
		}
	}
	if (Math.abs(stripWidth - localPos) < closestDistance) {
		return slideOffsets.length;
	}
	return closest;
}

// picture numbers run past the end of a pass, and carry into the next one
function slidePos(index) {
	let passes = Math.floor(index / slideOffsets.length);
	return passes * stripWidth + slideOffsets[modulo(index, slideOffsets.length)];
}

function snapTarget(pos) {
	let localPos = modulo(pos, stripWidth);
	let index = nearestSlide(localPos);
	let offset = index == slideOffsets.length ? stripWidth : slideOffsets[index];
	return pos - localPos + offset;
}

function stopTrack() {
	clearTimeout(snapTimeout);
	if (trackFrame != null) {
		cancelAnimationFrame(trackFrame);
		trackFrame = null;
	}
}

function animateTrack() {
	let progress = Math.min(1, (performance.now() - trackTime) / SNAP_DURATION);
	let eased = 1 - Math.pow(1 - progress, 3);
	setTrackPos(trackStart + (trackTarget - trackStart) * eased);
	if (progress >= 1) {
		trackFrame = null;
		settleTrack();
		return;
	}
	trackFrame = requestAnimationFrame(animateTrack);
}

// every move ends on a picture, so the strip is never left sitting between two
function moveTrackTo(pos) {
	stopTrack();
	trackStart = trackPos;
	trackTarget = pos;
	trackTime = performance.now();
	trackFrame = requestAnimationFrame(animateTrack);
}

// whatever landed in the first picture's place is now the one being looked at
function settleTrack() {
	if (!stripWidth) {
		return;
	}
	let localPos = modulo(trackPos, stripWidth);
	trackPos = localPos; // the number is free to stay small, the strip looks the same either way
	setOpenImage(modulo(nearestSlide(localPos), slideOffsets.length));
}

// the strip follows the input directly, and settles only once it stops
function scrollTrack(delta) {
	if (entryImages.length < 2 || !stripWidth) {
		return;
	}
	stopTrack();
	setTrackPos(trackPos + delta);
}

function snapTrack() {
	if (entryImages.length < 2 || !stripWidth) {
		return;
	}
	moveTrackTo(snapTarget(trackPos));
}

// the copy of the picture standing in the first picture's place, the only one that zooms
function activeSlide() {
	return ENTRY_TRACK.children[openImage] || null;
}

function activeScroll() {
	let slide = activeSlide();
	return slide ? slide.querySelector('.entry-scroll') : null;
}

function setOpenImage(index) {
	let data = ENTRY_DATA[openEntry];
	if (!data) {
		return;
	}
	openImage = modulo(index, data.images.length);
	let current = data.images[openImage];

	ENTRY_CODE.textContent = `[${current.label || current.code}]`;
	ENTRY_DOWNLOAD.href = current.download;
	ENTRY_TYPE.textContent = current.type;
	ENTRY_COUNT.textContent = `[${openImage + 1} / ${data.images.length}]`;

	for (let i = 0; i < ENTRY_TRACK.children.length; i++) {
		ENTRY_TRACK.children[i].dataset.active = i == openImage ? '1' : '0';
	}

	setZoom(0); // a zoom belongs to the picture it was made on
	updateUrl();
}

// the middle of the frame stays on the same part of the picture as the level changes
function setZoom(level) {
	let scroll = activeScroll();
	let across = 0.5;
	let down = 0.5;
	if (scroll && ZOOMS[zoomLevel] > 1 && scroll.scrollWidth && scroll.scrollHeight) {
		across = (scroll.scrollLeft + scroll.clientWidth / 2) / scroll.scrollWidth;
		down = (scroll.scrollTop + scroll.clientHeight / 2) / scroll.scrollHeight;
	}

	zoomLevel = Math.min(Math.max(level, 0), ZOOMS.length - 1);
	let zoom = ZOOMS[zoomLevel];

	for (let slide of ENTRY_TRACK.children) {
		let slideZoom = slide.dataset.active == '1' ? zoom : 1;
		slide.querySelector('.entry-frame').dataset.zoom = slideZoom;
		slide.querySelector('.entry-scroll').style.setProperty('--zoom', slideZoom);
		slide.dataset.panning = '0';
	}

	if (!scroll) {
		return;
	}
	if (zoom == 1) {
		scroll.scrollLeft = 0;
		scroll.scrollTop = 0;
		return;
	}
	scroll.scrollLeft = across * scroll.scrollWidth - scroll.clientWidth / 2;
	scroll.scrollTop = down * scroll.scrollHeight - scroll.clientHeight / 2;
}

// a zoomed picture is dragged rather than scrolled, by mouse or by finger
function panBy(across, down) {
	let scroll = activeScroll();
	if (!scroll) {
		return;
	}
	scroll.scrollLeft += across;
	scroll.scrollTop += down;
}

function showEntry(entry, image) {
	let data = ENTRY_DATA[entry];
	if (!data || !data.images.length) {
		return;
	}
	let sameEntry = entry == openEntry && isEntryOpen();
	openEntry = entry;
	entryImages = data.images;

	ENTRY_NAME.textContent = data.name;
	ENTRY_PLACE.textContent = data.place;
	ENTRY_DATE.textContent = data.date;

	// a lone photograph gets the whole panel: no stepping controls, and nothing to scroll to
	ENTRY.dataset.single = data.images.length == 1 ? '1' : '0';
	ENTRY.dataset.active = '1';
	BACKDROP.dataset.active = '1';

	// the strip can only be measured once the panel is on screen
	stopTrack();
	if (!sameEntry || !ENTRY_TRACK.children.length) {
		buildTrack();
	}
	setTrackPos(slideOffsets[modulo(image, data.images.length)] || 0);
	setOpenImage(image);
	bindInput();
}

function stepEntry(count) {
	if (openEntry < 0 || !stripWidth || entryImages.length < 2) {
		return;
	}
	stopTrack();
	let localPos = modulo(trackPos, stripWidth);
	let target = trackPos - localPos + slidePos(nearestSlide(localPos) + count);
	// below the breakpoint the buttons change the picture outright, and only a swipe slides
	if (trackVertical()) {
		setTrackPos(target);
		settleTrack();
		return;
	}
	moveTrackTo(target);
}

// the column can change width under an open entry, and every picture is measured off it
function rebuildTrack() {
	if (!isEntryOpen()) {
		return;
	}
	let index = openImage;
	stopTrack();
	buildTrack();
	setTrackPos(slideOffsets[index] || 0);
	setOpenImage(index);
}

function closeEntry() {
	stopTrack();
	entryTouch = null;
	panMouse = null;
	ENTRY.dataset.active = '0';
	BACKDROP.dataset.active = '0';
	setZoom(0);
	openEntry = -1;
	bindInput();
	updateUrl();
}


/* view switching */

// the url carries the view and, when one is open, the code of the picture on screen
function updateUrl() {
	let params = new URLSearchParams();
	if (view != 'list' || viewNamed) {
		params.set('view', view);
	}
	let data = ENTRY_DATA[openEntry];
	if (data && data.images[openImage]) {
		params.set('code', data.images[openImage].code);
	}
	let query = params.toString();
	history.replaceState(null, '', query ? `?${query}` : location.pathname);
}

// codes are unique across the archive, so one identifies both entry and picture
function readUrl() {
	let params = new URLSearchParams(location.search);
	let named = params.get('view');
	if (named == 'list' || named == 'image') {
		viewNamed = true;
		setView(named);
	}
	let code = params.get('code');
	if (!code) {
		return;
	}
	for (let entry = 0; entry < ENTRY_DATA.length; entry++) {
		let image = ENTRY_DATA[entry].images.findIndex(item => item.code == code);
		if (image >= 0) {
			showEntry(entry, image);
			return;
		}
	}
}

function setView(name) {
	view = name;
	let isList = view == 'list';

	LIST.dataset.active = isList ? '1' : '0';
	LIST_GRIDLINES.dataset.active = isList ? '1' : '0';
	IMAGES.dataset.active = isList ? '0' : '1';
	IMAGES_GRIDLINES.dataset.active = isList ? '0' : '1';
	SHUFFLE.dataset.active = isList ? '0' : '1';
	SORT.dataset.show = isList ? '1' : '0';
	for (let toggle of VIEW_TOGGLES) {
		toggle.dataset.active = toggle.dataset.view == view ? '1' : '0';
	}

	// both views measure themselves, so they can only be built once visible
	if (isList) {
		PREVIEW.dataset.active = activeEntry ? '1' : '0';
		build();
	} else {
		PREVIEW.dataset.active = '0';
		// the image view opens on a fresh order the first time it is reached
		if (!hasShuffled) {
			hasShuffled = true;
			shuffleImages();
		} else {
			buildImages();
		}
	}
	bindInput();
	updateUrl();
}


/* events */

for (let i = 0; i < LIST_HEADINGS.length; i++) {
	LIST_HEADINGS[i].addEventListener('click', () => {
		sortByColumn(i);
	});
}

// delegated so it survives sorting and restacking
LIST_LINKS.addEventListener('mouseover', (event) => {
	let row = event.target.closest('.index-list-link');
	if (row) {
		setActiveEntry(originalRows[row.dataset.row]);
	}
});

// both views mark their entries the same way, so one handler covers them. a row opens on
// the entry's thumbnail, an image card on the one it is showing
function openFromIndex(event) {
	let target = event.target.closest('[data-entry]');
	if (!target) {
		return;
	}
	event.preventDefault();
	showEntry(Number(target.dataset.entry), Number(target.dataset.photo) || 0);
}
LIST_LINKS.addEventListener('click', openFromIndex);
IMAGES.addEventListener('click', openFromIndex);

IMAGES.addEventListener('mouseover', (event) => {
	let item = event.target.closest('.index-image');
	if (item) {
		setActiveImage(originalImages[item.dataset.image]);
	}
});

// the preview stands for the row lit under the pointer, so it opens whatever that row would
PREVIEW.addEventListener('click', (event) => {
	if (!activeEntry) {
		return;
	}
	event.preventDefault();
	showEntry(Number(activeEntry.dataset.entry), Number(activeEntry.dataset.photo) || 0);
});

// everything left of the overlay is inert while it's open, and clicking there closes it
BACKDROP.addEventListener('click', closeEntry);

ENTRY_CLOSE.addEventListener('click', (event) => {
	event.preventDefault();
	closeEntry();
});
document.querySelector('.entry-nav-prev').addEventListener('click', (event) => {
	event.preventDefault();
	stepEntry(-1);
});
document.querySelector('.entry-nav-next').addEventListener('click', (event) => {
	event.preventDefault();
	stepEntry(1);
});
// the controls are stamped into every picture, so they are caught on the way up
ENTRY_TRACK.addEventListener('click', (event) => {
	let control = event.target.closest('.entry-zoom-in, .entry-zoom-out');
	if (!control) {
		return;
	}
	event.preventDefault();
	setZoom(zoomLevel + (control.classList.contains('entry-zoom-in') ? 1 : -1));
});

// dragging a zoomed picture moves the picture inside its frame
ENTRY_TRACK.addEventListener('mousedown', (event) => {
	if (ZOOMS[zoomLevel] == 1 || event.button != 0 || event.target.closest('.entry-zoom')) {
		return;
	}
	let slide = event.target.closest('.entry-slide');
	if (!slide || slide != activeSlide()) {
		return;
	}
	event.preventDefault();
	panMouse = {x: event.clientX, y: event.clientY, slide: slide};
	slide.dataset.panning = '1';
});
window.addEventListener('mousemove', (event) => {
	if (!panMouse) {
		return;
	}
	panBy(panMouse.x - event.clientX, panMouse.y - event.clientY);
	panMouse.x = event.clientX;
	panMouse.y = event.clientY;
});
window.addEventListener('mouseup', () => {
	if (!panMouse) {
		return;
	}
	panMouse.slide.dataset.panning = '0';
	panMouse = null;
});

SORT.querySelector('.index-sort-toggle').addEventListener('click', (event) => {
	event.preventDefault();
	setSortMenu(SORT.dataset.active != '1');
});

for (let option of document.querySelectorAll('.index-sort-option')) {
	option.addEventListener('click', (event) => {
		event.preventDefault();
		setColumn(Number(option.dataset.column));
		setSortMenu(false);
	});
}

// choosing a view by hand names it in the url, so a link to the list survives the phone opening on the pictures
for (let toggle of VIEW_TOGGLES) {
	toggle.addEventListener('click', (event) => {
		event.preventDefault();
		viewNamed = true;
		setView(toggle.dataset.view);
	});
}

SHUFFLE.addEventListener('click', (event) => {
	event.preventDefault();
	shuffleImages();
});

// scroll capture, nothing else on the page scrolls
function onWheel(event) {
	if (isEntryOpen()) {
		event.preventDefault();
		// a zoomed picture takes the input for itself, and pans rather than steps
		if (ZOOMS[zoomLevel] > 1) {
			panBy(event.deltaX, event.deltaY);
			return;
		}
		// a trackpad swipe reads across, a wheel reads down, and either moves the strip
		let along = trackVertical() || Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
		if (event.deltaMode == 1) {
			along *= 40;
		} else if (event.deltaMode == 2) {
			along *= mediaLength();
		}
		scrollTrack(along);
		snapTimeout = setTimeout(snapTrack, SNAP_DELAY); // settles once the input stops
		return;
	}

	// the pictures scroll themselves, a column at a time
	if (view == 'image') {
		return;
	}

	event.preventDefault();
	let delta = event.deltaY;
	if (event.deltaMode == 1) {
		delta *= 40;
	} else if (event.deltaMode == 2) {
		delta *= LIST_LINKS.clientHeight;
	}
	ratchet(delta, WHEEL_THRESHOLD);
}

// how far apart two fingers are, which is all a pinch amounts to
function touchSpread(touches) {
	return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
}

function startEntryTouch(event) {
	stopTrack();
	if (event.touches.length > 1) {
		entryTouch = {pinch: touchSpread(event.touches)};
		return;
	}
	entryTouch = {
		pinch: 0,
		x: event.touches[0].clientX,
		y: event.touches[0].clientY,
		time: performance.now(),
		speed: 0
	};
}

function moveEntryTouch(event) {
	event.preventDefault();
	if (!entryTouch) {
		return;
	}

	// two fingers buy a whole zoom level at a time, and the spread is measured again from there
	if (event.touches.length > 1) {
		if (!entryTouch.pinch) {
			entryTouch.pinch = touchSpread(event.touches);
		}
		let spread = touchSpread(event.touches);
		if (spread > entryTouch.pinch * PINCH_IN) {
			setZoom(zoomLevel + 1);
			entryTouch.pinch = spread;
		} else if (spread < entryTouch.pinch * PINCH_OUT) {
			setZoom(zoomLevel - 1);
			entryTouch.pinch = spread;
		}
		return;
	}

	// the tail of a pinch, once a finger has lifted, is not a drag
	if (entryTouch.pinch) {
		return;
	}

	let x = event.touches[0].clientX;
	let y = event.touches[0].clientY;
	let across = entryTouch.x - x;
	let down = entryTouch.y - y;
	entryTouch.x = x;
	entryTouch.y = y;

	if (ZOOMS[zoomLevel] > 1) {
		panBy(across, down);
		return;
	}

	// up and down below the breakpoint, side to side above it
	let along = trackVertical() ? down : across;

	// the last of the drag says how fast it was let go
	let now = performance.now();
	let step = now - entryTouch.time;
	entryTouch.time = now;
	if (step > 0) {
		entryTouch.speed = Math.max(-FLICK_CEILING, Math.min(FLICK_CEILING, along / step));
	}
	scrollTrack(along);
}

// letting go carries the strip a little further, and it settles on whichever picture it reaches
function endEntryTouch() {
	if (!entryTouch) {
		return;
	}
	let speed = entryTouch.pinch ? 0 : entryTouch.speed;
	entryTouch = null;
	if (ZOOMS[zoomLevel] > 1 || entryImages.length < 2 || !stripWidth) {
		return;
	}
	// a tap leaves the strip where it already was, and has nothing to settle
	let target = snapTarget(trackPos + speed * FLICK_PROJECTION);
	if (Math.abs(target - trackPos) < 0.5) {
		return;
	}
	moveTrackTo(target);
}

let touchPos = null;
window.addEventListener('touchstart', (event) => {
	if (isEntryOpen()) {
		startEntryTouch(event);
		return;
	}
	touchPos = event.touches[0].clientY;
	touchTime = performance.now();
	samples = [{pos: touchPos, time: touchTime}];
	velocity = 0;
	scrollAccum = 0;
	stopGlide();
}, {passive: true});

function onTouchMove(event) {
	if (isEntryOpen()) {
		moveEntryTouch(event);
		return;
	}
	if (touchPos == null) {
		return;
	}
	// the pictures scroll themselves, so a drag over them is the browser's
	if (view == 'image') {
		return;
	}

	event.preventDefault();
	let pos = event.touches[0].clientY;
	let delta = touchPos - pos;
	touchPos = pos;

	// the list follows the finger, and the last of the drag says how fast it was let go
	if (MOBILE.matches) {
		touchTime = performance.now();
		samples.push({pos: pos, time: touchTime});
		while (samples.length > 2 && touchTime - samples[0].time > GLIDE_WINDOW) {
			samples.shift();
		}
		setPos(scrollPos + delta);
		return;
	}

	ratchet(delta, 0); // a drag moves the list a row for every row it covers
}

// measured across the tail of the drag rather than the last frame alone, which is often the finger already slowing to lift
function releaseVelocity() {
	if (samples.length < 2) {
		return 0;
	}
	let first = samples[0];
	let last = samples[samples.length - 1];
	let step = last.time - first.time;
	return step > 0 ? (first.pos - last.pos) / step : 0;
}

// letting go hands the list over to the glide, which settles it on a row
function endTouch() {
	if (entryTouch) {
		endEntryTouch();
		return;
	}
	touchPos = null;
	scrollAccum = 0;
	if (MOBILE.matches && view == 'list' && rowOffsets.length) {
		// a finger held still sends nothing, so the gap since the last move is the tell
		velocity = performance.now() - touchTime > GLIDE_HOLD ? 0 : releaseVelocity();
		samples = [];
		stopGlide();
		glideTime = performance.now();
		glideFrame = requestAnimationFrame(glide);
	}
}
window.addEventListener('touchend', endTouch);
window.addEventListener('touchcancel', endTouch);

// a listener that might take the event has to be asked before the browser may scroll, so it is only attached where it is going to be used
function bindInput() {
	window.removeEventListener('wheel', onWheel, {passive: false});
	window.removeEventListener('touchmove', onTouchMove, {passive: false});
	// the columns of pictures are scrollers of their own, and only an open entry takes the input back
	if (view == 'image' && !isEntryOpen()) {
		return;
	}
	window.addEventListener('wheel', onWheel, {passive: false});
	window.addEventListener('touchmove', onTouchMove, {passive: false});
}

window.addEventListener('keydown', (event) => {
	let tag = event.target.tagName.toLowerCase();
	if (tag == 'input' || tag == 'textarea' || event.target.isContentEditable) {
		return;
	}
	if (isEntryOpen()) {
		if (event.key == 'Escape') {
			closeEntry();
		} else if (event.key == 'ArrowLeft') {
			stepEntry(-1);
		} else if (event.key == 'ArrowRight') {
			stepEntry(1);
		} else {
			return;
		}
		event.preventDefault();
		return;
	}

	// the browser drives the columns of pictures, so the keys are the list's alone
	if (view == 'image') {
		return;
	}

	if (event.key == 'ArrowDown') {
		stepRows(1);
	} else if (event.key == 'ArrowUp') {
		stepRows(-1);
	} else if (event.key == 'PageDown' || event.key == ' ') {
		pageRows(1);
	} else if (event.key == 'PageUp') {
		pageRows(-1);
	} else {
		return;
	}
	event.preventDefault();
});

// browsers scroll focused rows into view, which fights the custom offset
LIST_LINKS.addEventListener('scroll', () => {
	if (!isBuilding && Math.abs(LIST_LINKS.scrollTop - scrollPos) > 1) {
		LIST_LINKS.scrollTop = scrollPos;
	}
});

IMAGES.addEventListener('scroll', extendImages);

// row heights get measured from scratch whenever the space for them changes
let resizeTimeout = null;
function queueBuild() {
	clearTimeout(resizeTimeout);
	resizeTimeout = setTimeout(() => {
		if (view == 'list') {
			build();
		} else {
			measureImages();
		}
	}, 150);
}
window.addEventListener('resize', queueBuild);
// a column arrives or leaves, and the strip has to be dealt out again
WIDE.addEventListener('change', () => {
	if (view == 'image') {
		buildImages();
	}
});
// crossing the breakpoint swaps a driven scroll for the browser's own
MOBILE.addEventListener('change', () => {
	setSortMenu(false);
	bindInput();
	rebuildTrack();
	if (view == 'image') {
		buildImages();
	} else {
		build(true);
	}
});
new ResizeObserver(() => {
	if (view == 'list' && !isBuilding && Math.abs(LIST_LINKS.clientHeight - prevViewHeight) > 1) {
		queueBuild();
	}
}).observe(LIST_LINKS);

// follows the column through a drag rather than snapping once the resize ends. every picture is
// measured off that width, so the strip is laid out again once the dragging settles
let trackTimeout = null;
function queueTrack() {
	measureEntry();
	if (!isEntryOpen() || mediaLength() == trackWidth) {
		return;
	}
	clearTimeout(trackTimeout);
	trackTimeout = setTimeout(rebuildTrack, 150);
}
new ResizeObserver(queueTrack).observe(ENTRY_MEDIA);
new ResizeObserver(queueTrack).observe(ENTRY_TEXT);

setColumn(0); // addressee shows first on mobile

// the thumbnails load once the page itself has, so they never hold up anything on screen
window.addEventListener('load', preloadThumbnails);
setSortMenu(false);
bindInput();
sortByColumn(DEFAULT_SORT); // opens on date received, newest first
readUrl();
// webfonts change the height of a row and of a picture's caption alike, so whichever view is
// showing is laid out again once they have arrived
document.fonts.ready.then(() => view == 'list' ? build() : buildImages());

})();
