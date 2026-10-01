// the signup form's back end. the site itself is on github pages, and the form on its about page
// sends here, to /signup on this worker's own address. the email is kept in the signups database,
// and if resend has been set up, a notification is emailed as well
const TABLE = 'CREATE TABLE IF NOT EXISTS signups (email TEXT, created TEXT)';

export default {
	async fetch(request, env, ctx) {
		let url = new URL(request.url);
		if (url.pathname != '/signup') {
			return new Response('Not found', {status: 404});
		}

		// the form is on another address than this worker, so the browser only lets the page read the
		// answer when the worker names the page's address as allowed. anything sent from a page that
		// isn't on the list is turned away, which also keeps other sites from filling the list
		let origin = request.headers.get('Origin');
		let allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(address => address.trim()).filter(address => address);
		if (origin && !allowed.includes(origin)) {
			return new Response('Forbidden', {status: 403});
		}
		let headers = origin ? {'Access-Control-Allow-Origin': origin, 'Vary': 'Origin'} : {};

		// a browser may check with the worker before sending, and is told what it may send
		if (request.method == 'OPTIONS') {
			return new Response(null, {status: 204, headers: {
				...headers,
				'Access-Control-Allow-Methods': 'POST',
				'Access-Control-Allow-Headers': 'Content-Type',
				'Access-Control-Max-Age': '86400'
			}});
		}
		if (request.method != 'POST') {
			return new Response('Not found', {status: 404, headers});
		}

		let form = await request.formData();
		// the honeypot: a person never sees the company field, so anything in it came from a bot. it is
		// told everything went fine, so it has no reason to try again
		if (form.get('company')) {
			return new Response('ok', {headers});
		}
		let email = String(form.get('email') || '').trim();
		if (!email.includes('@') || email.length > 320) {
			return new Response('Invalid email', {status: 400, headers});
		}

		// the table is made the first time anyone signs up, so there is nothing to set up by hand
		let created = new Date().toISOString();
		await env.SIGNUPS.prepare(TABLE).run();
		await env.SIGNUPS.prepare('INSERT INTO signups (email, created) VALUES (?, ?)').bind(email, created).run();

		// the email goes out after the reply, so the visitor never waits on it, and a failed email never
		// loses a signup that has already been saved
		if (env.RESEND_API_KEY && env.NOTIFY_TO) {
			ctx.waitUntil(notify(env, email, created));
		} else {
			console.log('notification skipped:', env.RESEND_API_KEY ? 'no NOTIFY_TO' : 'no RESEND_API_KEY secret on this worker');
		}

		return new Response('ok', {headers});
	}
};

// resend's shared address can send without a domain of your own, but only to the email address
// the resend account was made with, which is all a notification needs
async function notify(env, email, created) {
	let response = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${env.RESEND_API_KEY}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			from: env.NOTIFY_FROM || 'Archivo Latino <onboarding@resend.dev>',
			to: [env.NOTIFY_TO],
			subject: `New signup: ${email}`,
			text: `${email} signed up for the Archivo Latino mailing list on ${created}.`
		})
	});
	if (!response.ok) {
		console.log('notification failed', response.status, await response.text());
	} else {
		console.log('notification sent to', env.NOTIFY_TO);
	}
}
