(function () {

const POPUPS = document.querySelectorAll('.about-popup');

// expanding text opens below whatever was clicked, and the column scrolls to reach it
for (let toggle of document.querySelectorAll('.about-toggle')) {
	toggle.addEventListener('click', (event) => {
		event.preventDefault();
		let expand = toggle.closest('.about-expand');
		expand.dataset.active = expand.dataset.active == '1' ? '0' : '1';
	});
}

// passing nothing closes them all, since no popup carries an empty name
function showPopup(name) {
	for (let popup of POPUPS) {
		popup.dataset.active = popup.dataset.policy == name ? '1' : '0';
	}
}

for (let link of document.querySelectorAll('.about-policy')) {
	link.addEventListener('click', (event) => {
		event.preventDefault();
		showPopup(link.dataset.policy);
	});
}

for (let close of document.querySelectorAll('.about-popup-close')) {
	close.addEventListener('click', (event) => {
		event.preventDefault();
		showPopup();
	});
}

window.addEventListener('keydown', (event) => {
	if (event.key == 'Escape') {
		showPopup();
	}
});

// signup, shown on arrival and dismissed for the visit. below the breakpoint it covers the page, so a dismissal there is remembered
const SIGNUP = document.querySelector('.signup');
const SIGNUP_KEY = 'archivo-latino-signup';
const MOBILE = window.matchMedia('(max-width: 900px)');

// private browsing refuses storage outright, in which case it simply opens every time
function isDismissed() {
	try {
		return localStorage.getItem(SIGNUP_KEY) == '1';
	} catch (error) {
		return false;
	}
}

function rememberDismissed() {
	try {
		localStorage.setItem(SIGNUP_KEY, '1');
	} catch (error) {
		return;
	}
}

// how long the thank you sits in place of the button
const SIGNUP_THANKS = 2000;

if (SIGNUP) {
	if (MOBILE.matches && isDismissed()) {
		SIGNUP.dataset.active = '0';
	}
	SIGNUP.querySelector('.signup-close').addEventListener('click', (event) => {
		event.preventDefault();
		SIGNUP.dataset.active = '0';
		if (MOBILE.matches) {
			rememberDismissed();
		}
	});

	let field = SIGNUP.querySelector('.signup-field');
	let submit = SIGNUP.querySelector('.signup-submit');
	let thanksTimeout = null;

	// the button says its piece for a moment and then goes back to being a button
	function setState(state) {
		submit.dataset.state = state;
		clearTimeout(thanksTimeout);
		thanksTimeout = setTimeout(() => {
			submit.dataset.state = 'idle';
		}, SIGNUP_THANKS);
	}

	// the browser's own check does the reading, but an empty box passes it. the address goes to
	// netlify's forms as the page's own form would send it, without leaving the page
	let sending = false;
	function sendSignup() {
		if (!field.value.trim() || !field.checkValidity()) {
			setState('invalid');
			return;
		}
		if (sending) {
			return;
		}
		// the cms preview only pretends, so nothing sent from it lands among the real signups
		if (location.pathname.startsWith('/admin/')) {
			field.value = '';
			setState('sent');
			return;
		}
		sending = true;
		fetch('/', {
			method: 'POST',
			headers: {'Content-Type': 'application/x-www-form-urlencoded'},
			body: new URLSearchParams(new FormData(SIGNUP)).toString()
		}).then((response) => {
			if (!response.ok) {
				throw new Error(response.status);
			}
			field.value = '';
			field.blur();
			setState('sent');
		}).catch(() => {
			setState('error');
		}).finally(() => {
			sending = false;
		});
	}

	submit.addEventListener('click', (event) => {
		event.preventDefault();
		sendSignup();
	});

	// the form has no submit button of its own, so return is caught here to send it the way one would
	// expect, and anything that does submit it is sent from here rather than by leaving the page
	field.addEventListener('keydown', (event) => {
		if (event.key == 'Enter') {
			event.preventDefault();
			sendSignup();
		}
	});
	SIGNUP.addEventListener('submit', (event) => {
		event.preventDefault();
		sendSignup();
	});
}

})();
