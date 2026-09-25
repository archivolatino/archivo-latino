(function () {

// captured up front, because opening anything replaces the url
const START = new URLSearchParams(location.search);

const MOBILE = window.matchMedia('(max-width: 900px)');

const ISSUES = document.querySelectorAll('.notes-issue');
const NAV = document.querySelector('.notes-nav');
const PREV = document.querySelector('.notes-prev');
const NEXT = document.querySelector('.notes-next');

// each issue appears once per column, so the count is the highest index plus one
let count = 0;
let numbers = [];
for (let issue of ISSUES) {
	let index = Number(issue.dataset.index);
	count = Math.max(count, index + 1);
	numbers[index] = issue.dataset.issue;
}
let current = count - 1; // the newest issue opens first

// the controls disappear at either end, and the separator with them
function showIssue(index) {
	current = Math.min(Math.max(index, 0), count - 1);
	for (let issue of ISSUES) {
		issue.dataset.active = Number(issue.dataset.index) == current ? '1' : '0';
	}
	PREV.dataset.active = current > 0 ? '1' : '0';
	NEXT.dataset.active = current < count - 1 ? '1' : '0';
	NAV.dataset.both = current > 0 && current < count - 1 ? '1' : '0';
	NAV.dataset.empty = count < 2 ? '1' : '0';
	updateUrl();
}

PREV.addEventListener('click', (event) => {
	event.preventDefault();
	showIssue(current - 1);
});
NEXT.addEventListener('click', (event) => {
	event.preventDefault();
	showIssue(current + 1);
});

// the editor's note opens below the fold and the column scrolls to reach it
for (let toggle of document.querySelectorAll('.notes-toggle')) {
	toggle.addEventListener('click', (event) => {
		event.preventDefault();
		let expand = toggle.closest('.notes-expand');
		expand.dataset.active = expand.dataset.active == '1' ? '0' : '1';
	});
}


/* article popups */

const ARTICLES = document.querySelectorAll('.article');
const ARTICLE_BACKDROP = document.querySelector('.article-backdrop');

// the head reserves half the screen, or enough to clear the title box, whichever is taller
function measureArticle(article) {
	let box = article.querySelector('.article-box');
	let head = article.querySelector('.article-head');
	if (!box || !head) {
		return;
	}
	let gap = MOBILE.matches ? 72 : 80;
	let floor = MOBILE.matches ? '33dvh' : '50vh';
	head.style.setProperty('--article-head', `max(${floor}, ${box.offsetTop + box.offsetHeight + gap}px)`);
}

// where the box sits against its marker, and how close it may come to the panel's edge
const NOTE_LEFT = 10;
const NOTE_MARGIN = 18;
const ISSUE_GAP = 20; // the clearance the issue line keeps from the close button

// the issue line is centred, so the width of the text says whether it clears the close button, and the name goes first
function measureIssue(article) {
	let issue = article.querySelector('.article-issue');
	let label = article.querySelector('.article-issue-label');
	let close = article.querySelector('.article-close');
	if (!issue || !label || !close) {
		return;
	}
	issue.dataset.short = '0';

	let panel = article.getBoundingClientRect();
	let text = label.getBoundingClientRect().width;
	if (panel.left + (panel.width - text) / 2 < close.getBoundingClientRect().right + ISSUE_GAP) {
		issue.dataset.short = '1';
	}
}

function closeNotes() {
	for (let note of document.querySelectorAll('.article-note')) {
		note.dataset.active = '0';
	}
}

// a note near the right edge slides back inside, measured once it is showing
function placeNote(note) {
	let box = note.querySelector('.article-note-box');
	let panel = note.closest('.article');
	if (!box || !panel) {
		return;
	}
	box.style.left = '';

	let edges = panel.getBoundingClientRect();
	let rect = box.getBoundingClientRect();
	let over = rect.right - (edges.right - NOTE_MARGIN);
	if (over <= 0) {
		return;
	}
	// but never so far that it runs off the near edge instead
	let room = rect.left - (edges.left + NOTE_MARGIN);
	box.style.left = `${NOTE_LEFT - Math.min(over, Math.max(room, 0))}px`;
}

function activeArticle() {
	for (let article of ARTICLES) {
		if (article.dataset.active == '1') {
			return article;
		}
	}
	return null;
}

// the url carries the issue on show and, when one is open, the article's slug
function updateUrl() {
	let params = new URLSearchParams();
	let article = activeArticle();
	if (article || current != count - 1) {
		params.set('issue', numbers[current]);
	}
	if (article) {
		params.set('article', article.dataset.article);
	}
	let query = params.toString();
	history.replaceState(null, '', query ? `?${query}` : location.pathname);
}

// slugs only have to be unique inside an issue, so both parts have to match
function showArticle(issue, name) {
	for (let article of ARTICLES) {
		article.dataset.active = article.dataset.issue == issue && article.dataset.article == name ? '1' : '0';
		if (article.dataset.active == '1') {
			article.scrollTop = 0;
			measureArticle(article);
			measureIssue(article);
		}
	}
	ARTICLE_BACKDROP.dataset.active = name ? '1' : '0';
	updateUrl();
}

for (let link of document.querySelectorAll('.notes-open, .article-more-link')) {
	link.addEventListener('click', (event) => {
		event.preventDefault();
		showArticle(link.dataset.issue, link.dataset.article);
	});
}

for (let article of ARTICLES) {
	article.querySelector('.article-close').addEventListener('click', (event) => {
		event.preventDefault();
		showArticle();
	});
	// a bio opens over the content below rather than growing the box
	for (let author of article.querySelectorAll('.article-author')) {
		author.addEventListener('click', (event) => {
			event.preventDefault();
			let box = author.closest('.article-box');
			box.dataset.active = box.dataset.active == '1' ? '0' : '1';
		});
	}
}

const HOVER = window.matchMedia('(hover: hover)');

// an annotation opens under the pointer and waits a moment after it leaves, long enough to cross the
// gap to the box and use a link inside it. the box belongs to the marker, so reading it counts as still
// pointing at the marker
const NOTE_LINGER = 400;
let noteTimeout = null;
document.addEventListener('mouseover', (event) => {
	if (!HOVER.matches) {
		return;
	}
	let note = event.target.closest('.article-note');
	if (!note) {
		return;
	}
	clearTimeout(noteTimeout);
	if (note.dataset.active == '1') {
		return;
	}
	closeNotes();
	note.dataset.active = '1';
	placeNote(note);
});
document.addEventListener('mouseout', (event) => {
	if (!HOVER.matches) {
		return;
	}
	let note = event.target.closest('.article-note');
	if (!note || note.contains(event.relatedTarget)) {
		return;
	}
	clearTimeout(noteTimeout);
	noteTimeout = setTimeout(() => {
		note.dataset.active = '0';
	}, NOTE_LINGER);
});

// a touch screen has nothing to hover with, so there an annotation is opened by tapping its marker
// and closed by tapping anything else
document.addEventListener('click', (event) => {
	if (HOVER.matches) {
		return;
	}
	let note = event.target.closest('.article-note');
	let inside = event.target.closest('.article-note-box');
	if (inside) {
		return;
	}
	let open = note && note.dataset.active != '1';
	closeNotes();
	if (open) {
		note.dataset.active = '1';
		placeNote(note);
	}
});

ARTICLE_BACKDROP.addEventListener('click', () => {
	showArticle();
});

window.addEventListener('keydown', (event) => {
	if (event.key == 'Escape') {
		closeNotes();
		showArticle();
	}
});

function measureOpen() {
	for (let article of ARTICLES) {
		if (article.dataset.active == '1') {
			measureArticle(article);
			measureIssue(article);
		}
	}
}

let resizeTimeout = null;
window.addEventListener('resize', () => {
	clearTimeout(resizeTimeout);
	resizeTimeout = setTimeout(measureOpen, 150);
});

// crossing the breakpoint moves the title box, so the space above the text changes with it
MOBILE.addEventListener('change', measureOpen);

// showIssue rewrites the url, so the query has to be read before anything runs
function readUrl() {
	let index = numbers.indexOf(START.get('issue'));
	showIssue(index >= 0 ? index : count - 1);

	let article = START.get('article');
	if (article) {
		showArticle(numbers[current], article);
	}
}

readUrl();

})();
