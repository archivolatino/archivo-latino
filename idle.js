(function () {

// how long the page sits untouched before the pages either side of it start to drift off, how much
// longer again before the page being read follows them, and how long a drift itself takes
const IDLE_DELAY = 8000;
const IDLE_PAGE_DELAY = 16000;
const IDLE_DRIFT = 30000;

const LETTER = '*';
const PERIOD = '.';
const KEEP = '[](){}'; // brackets are left standing

// how many empty lines have to run between the titles at the top and the content below them for
// the space between the two to count as the open middle of the page, which fills with periods
const FIELD_GAP = 5;
// a column of the content too narrow to hold a run of periods worth printing is left out of the
// open middle. it still gets them on its own lines, where they belong to something
const FIELD_MIN = 8;

// a panel opened over the page is the page for the moment, and drifts on its own terms: the words
// in it turn to asterisks and the spaces between them to periods, and nothing else is filled in
const PANELS = '.entry[data-active="1"], .view[data-active="1"], .article[data-active="1"]';
// the slivers of the other pages showing either side of the open one, each a preview of the page
// its link leads to, and each drifting off as a page of its own
const SIDES = '.section[data-active="0"]';
// while these are open the page is left alone altogether
const BLOCKERS = '.about-popup[data-active="1"], .nav[data-active="1"]';

// what counts as somebody still being here. scrolling is not on the list because the page does its
// own, and every scroll it makes is already the answer to one of these
const WAKING = ['mousemove', 'mousedown', 'mouseup', 'wheel', 'keydown', 'touchstart', 'touchmove', 'click', 'focusin'];

let drifts = []; // every copy standing over a page at the moment, each drifting on its own clock
let frame = null;
let sideTimer = null;
let pageTimer = null;

function modulo(value, max) {
	return ((value % max) + max) % max;
}

function openSection() {
	return document.querySelector('.section[data-active="1"]');
}

function isBlocked() {
	return document.hidden || document.querySelector(BLOCKERS) != null;
}

// the width of one character and the height of one line, which is the grid everything is set on
function metrics(section) {
	let probe = document.createElement('span');
	probe.style.cssText = 'position:absolute;top:0;left:0;visibility:hidden;white-space:pre;';
	probe.textContent = '0'.repeat(100);
	section.appendChild(probe);
	let advance = probe.getBoundingClientRect().width / 100;
	probe.remove();
	let line = parseFloat(getComputedStyle(section).lineHeight);
	return {
		advance: advance > 0 ? advance : 9.6,
		line: line > 0 ? line : 18.4
	};
}

// the phase the most lines share, so the periods fall in step with the words rather than beside them
function rhythm(values, period) {
	let counts = new Map();
	for (let value of values) {
		let key = Math.round(modulo(value, period));
		counts.set(key, (counts.get(key) || 0) + 1);
	}
	let best = 0;
	let bestCount = -1;
	for (let [key, count] of counts) {
		if (count > bestCount) {
			bestCount = count;
			best = key;
		}
	}
	return best;
}


/* what is on the page */

// the part of the page a run of words can actually be seen in: the column, cropped again by every
// box between the two that crops what it holds. a row scrolled out of the list is still sitting in
// the column, and would otherwise count as something on the page
function clipOf(element, rect, styles) {
	let box = {top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right};
	let ancestor = element;
	while (ancestor) {
		let css = styles(ancestor);
		// display:contents draws no box at all and display:inline draws one that cannot crop, so
		// neither of them takes anything off what can be seen however their overflow is set
		let boxed = css.display != 'contents' && css.display != 'inline';
		if (boxed && (css.overflow != 'visible' || css.overflowX != 'visible' || css.overflowY != 'visible')) {
			let own = ancestor.getBoundingClientRect();
			box.top = Math.max(box.top, own.top);
			box.bottom = Math.min(box.bottom, own.bottom);
			box.left = Math.max(box.left, own.left);
			box.right = Math.min(box.right, own.right);
		}
		if (ancestor.classList.contains('idle-copy')) {
			break;
		}
		ancestor = ancestor.parentElement;
	}
	return box;
}

// every run of words that can be seen, and the window it can be seen through
function gather(root, rect, styles) {
	let walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	let clips = new Map();
	let found = [];
	let node;
	while ((node = walker.nextNode())) {
		if (!/\S/.test(node.nodeValue)) {
			continue;
		}
		let parent = node.parentElement;
		if (!parent) {
			continue;
		}
		let clip = clips.get(parent);
		if (clip === undefined) {
			clip = clipOf(parent, rect, styles);
			clips.set(parent, clip);
		}
		if (clip.right <= clip.left || clip.bottom <= clip.top) {
			continue;
		}
		let box = parent.getBoundingClientRect();
		if (!box.width || !box.height) {
			continue;
		}
		if (box.bottom < clip.top || box.top > clip.bottom || box.right < clip.left || box.left > clip.right) {
			continue;
		}
		found.push({node: node, clip: clip});
	}
	return found;
}

// the block a run of words sits in, which is what says how far its line of periods may reach
function blockOf(node, styles) {
	let element = node.parentElement;
	while (element && element.parentElement) {
		let display = styles(element).display;
		if (display != 'inline' && display != 'contents') {
			break;
		}
		element = element.parentElement;
	}
	return element;
}

// inside its padding, so the periods keep the margins the column already keeps
function contentEdges(element, styles) {
	let rect = element.getBoundingClientRect();
	let css = styles(element);
	return {
		left: rect.left + (parseFloat(css.paddingLeft) || 0) + (parseFloat(css.borderLeftWidth) || 0),
		right: rect.right - (parseFloat(css.paddingRight) || 0) - (parseFloat(css.borderRightWidth) || 0)
	};
}

// a picture holds its place on the page like a word does, and nothing is printed over it
function pictures(root, rect, styles) {
	let taken = [];
	for (let element of root.querySelectorAll('img, svg, video, canvas')) {
		let box = element.getBoundingClientRect();
		if (!box.width || !box.height) {
			continue;
		}
		if (box.bottom <= rect.top || box.top >= rect.bottom || box.right <= rect.left || box.left >= rect.right) {
			continue;
		}
		// one lifted out of the flow is laid over the column rather than being what the column
		// holds, so it does not speak for what the column is made of
		let flow = true;
		for (let up = element; up && up != root; up = up.parentElement) {
			let position = styles(up).position;
			if (position == 'absolute' || position == 'fixed') {
				flow = false;
				break;
			}
		}
		taken.push({
			flow: flow,
			left: box.left - rect.left,
			right: box.right - rect.left,
			top: box.top - rect.top,
			bottom: box.bottom - rect.top,
			middle: box.top + box.height / 2 - rect.top,
			band: null
		});
	}
	return taken;
}

// where every word sits, and which line and which block it belongs to
function survey(root, found, rect, grid, styles) {
	let edges = new Map();
	let words = []; // {left, right, top, bottom, middle, band}
	let range = document.createRange();

	for (let entry of found) {
		let node = entry.node;
		let clip = entry.clip;
		let block = blockOf(node, styles);
		if (!block) {
			continue;
		}
		let band = edges.get(block);
		if (band === undefined) {
			band = contentEdges(block, styles);
			edges.set(block, band);
		}
		// writing set on its side stands across the lines rather than on one of them. it is still
		// noted down, since the periods have to keep off it, but it brings no line of its own
		let sideways = styles(node.parentElement).writingMode != 'horizontal-tb';
		// a band cannot reach past the window its words are seen through. one too narrow to hold a
		// single period gives its words no line to run along, but they are still noted down: a word
		// has to keep the periods off itself whether or not it brought a line of its own
		let left = Math.max(band.left, clip.left);
		let right = Math.min(band.right, clip.right);
		let line = right - left >= grid.advance ? {left: left - rect.left, right: right - rect.left} : null;

		let text = node.nodeValue;
		let run = /\S+/g;
		let match;
		while ((match = run.exec(text))) {
			range.setStart(node, match.index);
			range.setEnd(node, match.index + match[0].length);
			for (let box of range.getClientRects()) {
				if (!box.width || !box.height) {
					continue;
				}
				if (box.bottom <= clip.top || box.top >= clip.bottom || box.right <= clip.left || box.left >= clip.right) {
					continue;
				}
				words.push({
					word: !sideways,
					sideways: sideways,
					left: box.left - rect.left,
					right: box.right - rect.left,
					top: box.top - rect.top,
					bottom: box.bottom - rect.top,
					middle: box.top + box.height / 2 - rect.top,
					band: line
				});
			}
		}
	}

	// the line every word landed on, counted off the rhythm the writing standing on lines keeps. a
	// picture is only ever something to keep clear of, so it is measured after the rhythm has been
	// taken
	let standing = words.filter(one => one.word);
	let origin = standing.length ? rhythm(standing.map(word => word.middle), grid.line) : grid.line / 2;
	let shown = pictures(root, rect, styles);
	words = words.concat(shown);
	let rows = new Map();
	for (let word of words) {
		if (!word.band) {
			continue;
		}
		let index = Math.round((word.middle - origin) / grid.line);
		let bands = rows.get(index);
		if (!bands) {
			bands = new Map();
			rows.set(index, bands);
		}
		let key = Math.round(word.band.left) + ':' + Math.round(word.band.right);
		if (!bands.has(key)) {
			bands.set(key, {left: word.band.left, right: word.band.right});
		}
	}
	return {rows: rows, words: words, pictures: shown, origin: origin};
}


/* where the periods go */

// bands that touch become one, so two of them never print two sets of periods over each other
function merge(bands) {
	let sorted = [...bands].sort((a, b) => a.left - b.left);
	let joined = [];
	for (let band of sorted) {
		let last = joined[joined.length - 1];
		if (last && band.left <= last.right + 0.5) {
			last.right = Math.max(last.right, band.right);
			continue;
		}
		joined.push({left: band.left, right: band.right});
	}
	return joined;
}

// what is left of a band once the words sitting on that line are taken out of it
function clear(band, words) {
	let free = [{left: band.left, right: band.right}];
	for (let word of words) {
		let next = [];
		for (let piece of free) {
			if (word.right <= piece.left || word.left >= piece.right) {
				next.push(piece);
				continue;
			}
			if (word.left > piece.left) {
				next.push({left: piece.left, right: word.left});
			}
			if (word.right < piece.right) {
				next.push({left: word.right, right: piece.right});
			}
		}
		free = next;
	}
	return free;
}

// the titles at the top, and then the open space under them. every column of the content below
// fills down to wherever its own content starts, so a column that has been scrolled fills less far
// than one that has not, and the gaps between the columns stay clear either way
function topField(rows, grid, shown, origin) {
	let sorted = [...rows.keys()].sort((a, b) => a - b);
	if (sorted.length < 2) {
		return null;
	}

	let gap = -1;
	for (let i = 0; i + 1 < sorted.length; i++) {
		if (sorted[i + 1] - sorted[i] >= FIELD_GAP) {
			gap = i;
			break;
		}
	}
	if (gap < 0) {
		return null;
	}

	// the columns the content runs in, taken from the content itself rather than from the titles
	let bands = [];
	for (let i = gap + 1; i < sorted.length; i++) {
		bands.push(...rows.get(sorted[i]).values());
	}
	let columns = [];
	for (let column of merge(bands)) {
		let starts = -1;
		for (let i = gap + 1; i < sorted.length && starts < 0; i++) {
			for (let band of rows.get(sorted[i]).values()) {
				if (band.left < column.right - 0.5 && band.right > column.left + 0.5) {
					starts = sorted[i];
					break;
				}
			}
		}
		if (starts <= sorted[gap] || column.right - column.left < FIELD_MIN * grid.advance) {
			continue;
		}
		// a column made of pictures rather than writing has no run-up of empty lines to fill: the
		// space above the first of them is the space the pictures are given. one picture on its own
		// is something the column happens to be holding, so it takes a run of them to say so
		let picture = Infinity;
		let count = 0;
		for (let taken of shown) {
			if (taken.right <= column.left + 0.5 || taken.left >= column.right - 0.5) {
				continue;
			}
			count++;
			picture = Math.min(picture, Math.round((taken.top - origin) / grid.line));
		}
		if (count > 1 && picture <= starts) {
			continue;
		}
		columns.push({left: column.left, right: column.right, last: starts - 1});
	}
	if (!columns.length) {
		return null;
	}
	return {first: sorted[0], titles: sorted[gap], columns: columns};
}

// one line's worth of periods, set on the same character grid the band's own words are set on. they
// are written as characters rather than painted on, so they can arrive one at a time like the rest
function stripe(band, gap, line, grid) {
	// the first whole character cell of the band that the gap has room for. a gap that already
	// starts on a cell, give or take a rounding error, starts there rather than a cell further on
	let into = modulo(gap.left - band.left, grid.advance);
	if (into < 0.5 || into > grid.advance - 0.5) {
		into = 0;
	}
	let left = gap.left + (into ? grid.advance - into : 0);
	let count = Math.floor((gap.right - left + 0.5) / grid.advance);
	if (count < 1) {
		return null;
	}

	let element = document.createElement('div');
	element.className = 'idle-row';
	element.style.left = left + 'px';
	element.style.top = line.top + 'px';
	element.style.width = (count * grid.advance) + 'px';
	// the box of the writing beside it, with no leading of its own, which puts the periods on the
	// same baseline however tall a line that particular writing is set on
	element.style.height = line.height + 'px';
	element.style.lineHeight = line.height + 'px';
	element.textContent = ' '.repeat(count);
	return element;
}

// the line the words on a row are actually set on. where a row holds no words there are none to
// follow, and it falls back to the rhythm the page as a whole keeps
function lineOf(sitting, row, origin, grid) {
	let counts = new Map();
	for (let one of sitting) {
		if (!one.word) {
			continue;
		}
		let key = Math.round(one.top);
		let held = counts.get(key);
		if (!held) {
			held = {count: 0, top: one.top, bottom: one.bottom};
			counts.set(key, held);
		}
		held.count++;
		held.bottom = Math.max(held.bottom, one.bottom);
	}
	let best = null;
	for (let held of counts.values()) {
		if (!best || held.count > best.count) {
			best = held;
		}
	}
	if (best && best.bottom > best.top) {
		return {top: best.top, height: best.bottom - best.top};
	}
	return {top: origin + row * grid.line - grid.line / 2, height: grid.line};
}

function paint(dots, plan, words, origin, grid, panel) {
	let field = document.createDocumentFragment();
	let written = [];
	for (let entry of plan) {
		let top = origin + entry.row * grid.line - grid.line / 2;
		// everything standing anywhere on this line, whichever line it belongs to: a letter that
		// hangs into the line above or below still has to keep the periods off itself
		let sitting = words.filter(word => word.top < top + grid.line - 0.5 && word.bottom > top + 0.5);
		let line = lineOf(sitting, entry.row, origin, grid);
		for (let band of entry.bands) {
			// the lines a heading set on its side stands over are its own, the way the space a picture
			// takes is, so nothing is printed beside it
			if (sitting.some(one => one.sideways && one.right > band.left + 0.5 && one.left < band.right - 0.5)) {
				continue;
			}
			// over a panel the periods only stand in the spaces between the words, and never run
			// on past the last of them to the edge of the column
			let reach = band;
			if (panel) {
				let inside = sitting.filter(word => word.right > band.left + 0.5 && word.left < band.right - 0.5);
				if (inside.length < 2) {
					continue;
				}
				reach = {
					left: Math.min(...inside.map(word => word.left)),
					right: Math.max(...inside.map(word => word.right))
				};
			}
			for (let gap of clear(reach, sitting)) {
				let element = stripe(band, gap, line, grid);
				if (element) {
					field.appendChild(element);
					written.push(element);
				}
			}
		}
	}
	dots.replaceChildren(field);
	return written;
}

// the rows that get periods: every row the titles and the open space under them cover, and after
// that only the rows that carry words
function planRows(survey, grid, panel) {
	let field = panel ? null : topField(survey.rows, grid, survey.pictures, survey.origin);
	let wanted = new Map();
	function rowAt(row) {
		let held = wanted.get(row);
		if (!held) {
			held = {row: row, bands: []};
			wanted.set(row, held);
		}
		return held;
	}

	// a heading that only takes up the width of its own words still belongs to its column, and its
	// line of periods runs to the end of that column like every other line standing in it
	if (field) {
		for (let bands of survey.rows.values()) {
			for (let [key, band] of bands) {
				for (let column of field.columns) {
					if (band.left >= column.left - 0.5 && band.right <= column.right + 0.5) {
						bands.set(key, {left: column.left, right: column.right});
						break;
					}
				}
			}
		}
	}

	// the open middle first, one column at a time, each down to where its own content begins
	if (field) {
		for (let column of field.columns) {
			for (let row = field.first; row <= column.last; row++) {
				rowAt(row).bands.push(column);
			}
		}
	}
	// and then every line of the content itself, across the block its words sit in
	for (let [row, bands] of survey.rows) {
		if (field && row <= field.titles) {
			continue; // the titles stand in the open middle, and keep to its columns
		}
		rowAt(row).bands.push(...bands.values());
	}

	let plan = [];
	for (let entry of wanted.values()) {
		entry.bands = merge(entry.bands);
		plan.push(entry);
	}
	return plan;
}


/* the drift itself */

function convertible(character) {
	return !/\s/.test(character) && KEEP.indexOf(character) < 0;
}

function shuffle(list) {
	for (let i = list.length - 1; i > 0; i--) {
		let j = Math.floor(Math.random() * (i + 1));
		let held = list[i];
		list[i] = list[j];
		list[j] = held;
	}
}

// a copy of a column, laid exactly over it, with nothing in it that can be clicked or read aloud
function buildOverlay(section, panel) {
	let rect = section.getBoundingClientRect();
	if (!rect.width || !rect.height) {
		return null;
	}
	let grid = metrics(section);

	let box = document.createElement('div');
	box.className = 'idle';
	box.setAttribute('aria-hidden', 'true');
	box.style.top = rect.top + 'px';
	box.style.left = rect.left + 'px';
	box.style.width = rect.width + 'px';
	box.style.height = rect.height + 'px';

	// the paper the periods are printed on, taken from the column so it is the same sheet. a panel
	// brings its own, and is only ever written over rather than printed on
	if (panel) {
		box.dataset.panel = '1';
	} else {
		let paper = getComputedStyle(section).backgroundColor;
		if (!paper || paper == 'transparent' || /rgba\(0, 0, 0, 0\)/.test(paper)) {
			paper = getComputedStyle(document.body).backgroundColor;
		}
		box.style.backgroundColor = paper;
	}

	// a collapsed column the pointer came to rest on is on red paper, and the copy is not the thing
	// being pointed at, so it is told to take the ink that goes with red
	if (!panel && section.dataset.active == '0' && section.matches(':hover')) {
		box.dataset.hover = '1';
	}

	let dots = document.createElement('div');
	dots.className = 'idle-dots';

	let copy = section.cloneNode(true);
	copy.classList.add('idle-copy');

	// what the copy has to be told, read off the page in one go before anything is written back
	let sources = section.querySelectorAll('*');
	let notes = [];
	for (let i = 0; i < sources.length; i++) {
		let source = sources[i];
		let picture = source.tagName == 'IMG' ? source.getBoundingClientRect() : null;
		if (source.scrollTop || source.scrollLeft || picture) {
			notes.push({
				index: i,
				top: source.scrollTop,
				left: source.scrollLeft,
				width: picture ? picture.width : 0,
				height: picture ? picture.height : 0,
				picture: picture != null
			});
		}
	}

	box.appendChild(dots);
	box.appendChild(copy);
	document.body.appendChild(box);

	let clones = copy.querySelectorAll('*');
	for (let note of notes) {
		let clone = clones[note.index];
		if (!clone) {
			continue;
		}
		// the copy starts where the page had got to, not at the top of everything it holds
		if (note.top) {
			clone.scrollTop = note.top;
		}
		if (note.left) {
			clone.scrollLeft = note.left;
		}
		// a copied picture has not been fetched yet and would hold no room open until it had,
		// which would shuffle everything under it out from beneath the words. it is handed the
		// room the picture it was copied from is already taking
		if (note.picture) {
			clone.removeAttribute('loading');
			clone.style.width = note.width + 'px';
			clone.style.height = note.height + 'px';
		}
	}

	// nothing in the copy is meant to run, and nothing in it may answer to a name the page uses
	for (let stray of copy.querySelectorAll('script, template, style')) {
		stray.remove();
	}
	copy.removeAttribute('id');
	for (let named of copy.querySelectorAll('[id]')) {
		named.removeAttribute('id');
	}

	let cache = new Map();
	function styles(element) {
		let held = cache.get(element);
		if (held === undefined) {
			held = getComputedStyle(element);
			cache.set(element, held);
		}
		return held;
	}

	let found = gather(copy, rect, styles);
	let nodes = found.map(entry => entry.node);
	let letters = nodes.map(node => node.nodeValue.split(''));
	let targets = nodes.map(() => LETTER);

	// an asterisk is exactly as wide as the letter it stands in for, but it is not a place a line
	// may break the way a hyphen is, so a line can still gather itself up differently once it has
	// drifted. the periods are laid out against where the words finish up, and the words are then
	// put back to drift there
	let written = nodes.map(node => node.nodeValue);
	for (let i = 0; i < nodes.length; i++) {
		nodes[i].nodeValue = letters[i].map(character => convertible(character) ? LETTER : character).join('');
	}
	let seen = survey(copy, found, rect, grid, styles);
	let stripes = paint(dots, planRows(seen, grid, panel), seen.words, seen.origin, grid, panel);
	for (let i = 0; i < nodes.length; i++) {
		nodes[i].nodeValue = written[i];
	}

	// the periods are written into their lines the same way the letters are written over theirs,
	// so both arrive one character at a time and neither is faded in over the other
	for (let element of stripes) {
		nodes.push(element.firstChild);
		letters.push(element.firstChild.nodeValue.split(''));
		targets.push(PERIOD);
	}

	let queue = [];
	for (let n = 0; n < letters.length; n++) {
		let target = targets[n];
		for (let i = 0; i < letters[n].length; i++) {
			if (target == PERIOD || convertible(letters[n][i])) {
				queue.push([n, i]);
			}
		}
	}
	shuffle(queue);
	return {box: box, nodes: nodes, letters: letters, targets: targets, queue: queue, placed: 0, start: 0, hidden: null};
}

// every character of every copy arrives on its own, in no order, until none of them are left
function drift(now) {
	let running = false;
	for (let one of drifts) {
		let progress = Math.min(1, (now - one.start) / IDLE_DRIFT);
		let wanted = Math.floor(progress * one.queue.length);
		let touched = new Set();
		while (one.placed < wanted) {
			let slot = one.queue[one.placed++];
			one.letters[slot[0]][slot[1]] = one.targets[slot[0]];
			touched.add(slot[0]);
		}
		for (let n of touched) {
			one.nodes[n].nodeValue = one.letters[n].join('');
		}
		if (progress < 1) {
			running = true;
		}
	}
	frame = running ? requestAnimationFrame(drift) : null;
}

function startDrift(target, panel) {
	let one = buildOverlay(target, panel);
	if (!one) {
		return;
	}
	// the copy carries the panel's own half see-through paper, so the panel itself steps back
	// rather than showing through it twice over. it keeps its place, and everything it can be
	// clicked on for, since only the ink of it is taken away
	if (panel) {
		one.hidden = {element: target, opacity: target.style.opacity};
		target.style.opacity = '0';
	}
	one.start = performance.now();
	drifts.push(one);
	if (frame == null) {
		frame = requestAnimationFrame(drift);
	}
}

// the pages either side of the one being read go first, each on its own, previews and all
function startSides() {
	if (isBlocked()) {
		return;
	}
	for (let section of document.querySelectorAll(SIDES)) {
		startDrift(section, false);
	}
}

// and then the page being read, or whatever it has opened over itself
function startPage() {
	if (isBlocked()) {
		return;
	}
	let panel = document.querySelector(PANELS);
	let target = panel || openSection();
	if (target) {
		startDrift(target, panel != null);
	}
}

// the page is wanted again, so the copies go at once rather than fading out of the way
function endIdle() {
	if (frame != null) {
		cancelAnimationFrame(frame);
		frame = null;
	}
	for (let one of drifts) {
		one.box.remove();
		if (one.hidden) {
			one.hidden.element.style.opacity = one.hidden.opacity;
		}
	}
	drifts = [];
}

function wake(event) {
	// a copy is not the page, and nothing that happens inside one counts as somebody arriving
	if (event && event.target instanceof Node && drifts.some(one => one.box.contains(event.target))) {
		return;
	}
	endIdle();
	clearTimeout(sideTimer);
	clearTimeout(pageTimer);
	sideTimer = setTimeout(startSides, IDLE_DELAY);
	pageTimer = setTimeout(startPage, IDLE_PAGE_DELAY);
}

for (let name of WAKING) {
	window.addEventListener(name, wake, {passive: true, capture: true});
}
window.addEventListener('resize', wake);
document.addEventListener('visibilitychange', wake);

wake();

})();
