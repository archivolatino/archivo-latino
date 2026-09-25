(function () {

// netlify identity mails its invite, password reset and confirmation links to the root of the
// site, but only the cms page knows what to do with them, so they are passed along to it
if (/(invite|recovery|confirmation|email_change)_token=/.test(location.hash)) {
	location.replace('/admin/' + location.hash);
	return;
}

// ios zooms in on any field set smaller than 16px when it is tapped, and the site's text is 14px.
// capping the scale stops that, and ios still lets a pinch zoom past the cap. it is left off
// everywhere else, since android would take the cap as a ban on pinching
if (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform == 'MacIntel' && navigator.maxTouchPoints > 1)) {
	let viewport = document.querySelector('meta[name="viewport"]');
	if (viewport) {
		viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0';
	}
}

// a language link goes to the same page, so the query carrying whatever is open travels with it
for (let link of document.querySelectorAll('.lang-toggle, .nav-language-links a')) {
	link.addEventListener('click', (event) => {
		if (!location.search) {
			return;
		}
		event.preventDefault();
		location.href = link.pathname + location.search;
	});
}

// the mobile sidebar, shared by every page and only visible below the breakpoint
const NAV = document.querySelector('.nav');
if (!NAV) {
	return;
}

const BAR = NAV.querySelector('.nav-bar');

function setNav(open) {
	NAV.dataset.active = open ? '1' : '0';
}

// the closed bar opens the menu, but once open only the marker closes it
BAR.addEventListener('click', (event) => {
	event.preventDefault();
	if (NAV.dataset.active != '1' || event.target.closest('.nav-open')) {
		setNav(NAV.dataset.active != '1');
	}
});

// the strip of page still showing to the right of the menu closes it too
document.addEventListener('click', (event) => {
	if (NAV.dataset.active == '1' && !event.target.closest('.nav')) {
		setNav(false);
	}
});

})();
