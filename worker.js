// the signup form's back end. the site itself is on github pages, and the form on its about page
// sends here, to /signup on this worker's own address. the email is kept in the signups database,
// and if resend has been set up, a notification is emailed as well
const TABLE = 'CREATE TABLE IF NOT EXISTS signups (email TEXT, created TEXT)';

export default {
	async fetch(request, env, ctx) {
		let url = new URL(request.url);
		if (url.pathname == '/signups.csv') {
			return exportSignups(url, env);
		}
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

// the list as a spreadsheet, which google sheets keeps up to date by itself with
// =IMPORTDATA("https://<this worker's address>/signups.csv?key=<the key>"). the key is a secret on the
// worker (npx wrangler secret put EXPORT_KEY), and until it is set the list can't be read at all.
// anyone with the key can read every address, so it only goes in a sheet shared with the people who
// should see them
async function exportSignups(url, env) {
	if (!env.EXPORT_KEY || url.searchParams.get('key') != env.EXPORT_KEY) {
		return new Response('Not found', {status: 404});
	}
	await env.SIGNUPS.prepare(TABLE).run();
	let {results} = await env.SIGNUPS.prepare('SELECT email, created FROM signups ORDER BY created DESC').all();
	let rows = [['Email', 'Signed up (UTC)'], ...results.map(row => [row.email, row.created.slice(0, 16).replace('T', ' ')])];
	// a cell that starts like a formula is kept as text, so an address typed to look like one is never
	// run by whatever spreadsheet opens the file
	let cell = value => `"${String(value).replace(/^[=+\-@]/, "'$&").replace(/"/g, '""')}"`;
	let csv = rows.map(row => row.map(cell).join(',')).join('\n');
	return new Response(csv, {headers: {'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store'}});
}

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
