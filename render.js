// the site's pages as text. build.js writes them to disk and the cms shows them in its preview, so
// nothing in here reads or writes a file, and it runs the same in node and in a browser
(function (exports) {

const CALENDAR_COLUMNS = 13;

// furniture, not content, so it lives here rather than in the json. a word that changes with the
// language carries both, and is asked for the one being built
const WORDS = (en, es) => ({en: en, es: es});
function say(value, language) {
	return value && typeof value == 'object' && !Array.isArray(value) ? value[language.code] : value;
}
const READ_MORE = WORDS('Read more', 'Lee más');
// a character wrapped so the ink circle can sit behind it on hover
const MARK = (character) => ` [<span class="mark">${character}</span>]`;
// one pair of brackets around whichever of + and - is showing, so hiding a state cannot leave its brackets behind
const TOGGLE_MARK = (open, close) => ` [<span class="mark"><span class="mark-more">${open}</span><span class="mark-less">${close}</span></span>]`;
const OPEN_CLOSE = TOGGLE_MARK('+', '-');
const READ_LESS = WORDS('Read less', 'Lee menos');
const UPCOMING_HEADING = WORDS('[Upcoming]', '[Próximamente]');
const NO_UPCOMING = WORDS('There are currently no upcoming events.', 'No se encuentran eventos programados en este momento.');
const PAST_HEADING = WORDS('[Past]', '[Pasados]');
const SUBMIT = WORDS('Submit', 'Enviar');
const REQUEST_LABEL = WORDS('[Request]', '[Solicitud]');
const SIGNUP_THANKS = WORDS('Thanks for your email!', '¡Gracias por tu correo!');
const SIGNUP_INVALID = WORDS('Please enter an email!', '¡Escribe tu correo!');
const SIGNUP_ERROR = WORDS('Something went wrong. Try again!', 'Algo salió mal. ¡Inténtalo de nuevo!');
// the name the signups are filed under in netlify's forms
const SIGNUP_FORM = 'signup';
const VIEW = WORDS('View the', 'Ver');
const INFORMATION = WORDS('Information', 'Información');
// spanish puts the state first, since it cannot agree with every kind of event after it
const VIEW_TITLE = {
	en: (kind, past) => `[${past ? 'Past' : 'Upcoming'} ${kind}]`,
	es: (kind, past) => `[${past ? 'Pasado' : 'Próximamente'}: ${kind}]`
};
const EDITORS_NOTE = WORDS('[Editor’s Note]', '[Nota Editorial]');
const VOLUME_LABEL = WORDS('Volume', 'Volumen');
const PREVIOUS_ISSUE = WORDS('PREVIOUS VOLUME', 'VOLUMEN ANTERIOR');
const NEXT_ISSUE = WORDS('NEXT VOLUME', 'VOLUMEN SIGUIENTE');
const CREDIT_FIRST = WORDS('by', 'por');
const CREDIT_REST = WORDS('and', 'y');
const MORE_FROM_ISSUE = WORDS('MORE FROM THIS VOLUME:', 'MÁS DE ESTE VOLUMEN:');
// shortcodes the article body is written with. a note sits inside a sentence and a figure takes a
// paragraph of its own, as the cms's image button writes it
const NOTE_PATTERN = /\{\{\s*note:\s*([\s\S]*?)\s*\}\}/g;
const FIGURE_PATTERN = /^\{\{\s*figure:\s*(.+?)\s*(?:\|\s*([\s\S]*?))?\s*\}\}$/;
// a numbered marker in a filled circle, the annotation sits behind it until hovered
const NOTE_MARK = (n) => `[<span class="article-note-mark">${n}</span>]`;
const EVENT_LABELS = {
	en: {Reception: 'Reception', 'On View': 'On View', Collaborator: 'Collaborator', Date: 'Date', Opens: 'Opens', Closes: 'Closes', Location: 'Location'},
	es: {Reception: 'Recepción', 'On View': 'En exhibición', Collaborator: 'Colaboradores', Date: 'Fecha', Opens: 'Abre', Closes: 'Cierra', Location: 'Lugar'}
};
const WHAT_HEADING = WORDS('[What]', '[El Archivo]');
const WHO_HEADING = WORDS('[Who]', '[Equipo]');
const CONTACT_HEADING = WORDS('[Contact]', '[Contacto]');
// the mobile nav, in its own order and with its own labels
const NAV_LINKS = [
	{key: 'index', label: WORDS('CATALOG', 'CATÁLOGO')},
	{key: 'events', label: WORDS('EVENTS', 'EVENTOS')},
	{key: 'notes', label: WORDS('JOURNAL', 'REVISTA')},
	{key: 'about', label: WORDS('ABOUT', 'ACERCA DE')}
];
const SITE_NAME = 'ARCHIVO LATINO';
// sharing cards need whole urls, so the site's own address is named here
const SITE_URL = 'https://archivolatino.org';
const SITE_DESCRIPTION = WORDS(
	'Archivo Latino is a mail-art-inspired research practice documenting the identities, cultures, and spatial practices of Latin America and its diaspora.',
	'Archivo Latino es un proyecto de investigación inspirado en el mail art que documenta las identidades, culturas y prácticas espaciales de América Latina y su diáspora.'
);
const META_DIR = 'assets/meta';
// the size sharing cards expect, and small enough for the ones that reject a large image
const OG_FILE = 'opengraph.jpg';
const WEBCLIP_FILE = 'webclip.png';
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const NAV_TITLE = 'ARCHIVO<br>LATINO';
const LANGUAGE_LABEL = WORDS('LANGUAGE', 'IDIOMA');
const LANGUAGE_NAMES = {en: 'ENGLISH', es: 'ESPAÑOL'};
const SHUFFLE_LABEL = WORDS('SHUFFLE', 'BARAJAR');
const LIST_LABEL = WORDS('LIST', 'LISTA');
const IMAGE_LABEL = WORDS('IMAGE', 'IMAGEN');
const SORT_LABEL = WORDS('SORT', 'ORDENAR');
const SELECT_ONE = WORDS('SELECT ONE', 'ELIGE UNA');
const DOWNLOAD_LABEL = WORDS('Download original', 'Descargar original');
const PREVIOUS_LABEL = WORDS('PREVIOUS', 'ANTERIOR');
const NEXT_LABEL = WORDS('NEXT', 'SIGUIENTE');
// the columns are the keys the json is read by, and each carries the words it is headed with
const COLUMNS = ['Addressee', 'City', 'Country', 'Type', 'Date'];
const COLUMN_LABELS = {
	en: ['Addressee', 'City', 'Country', 'Type', 'Date'],
	es: ['Destinatario', 'Ciudad', 'País', 'Tipo', 'Fecha']
};
// the short form each column takes once it is too narrow for the full one
const MOBILE_COLUMNS = {
	en: ['Addressee', 'City', 'Country', 'Type', 'Year'],
	es: ['Destinatario', 'Ciudad', 'País', 'Tipo', 'Año']
};
const COPYRIGHT = WORDS(['© YEAR Archivo Latino.', 'All rights reserved.'], ['© YEAR Archivo Latino.', 'Todos los derechos reservados.']);
const CREDIT = WORDS('Site by Fullservice Office', 'Diseño Web by Fullservice Office');
const CREDIT_URL = 'https://fullserviceoffice.com/';
const SIGNUP_TEXT = WORDS(
	'Stay tuned for upcoming exhibits, publications, and open calls.',
	'Mantente al tanto de próximas exposiciones, publicaciones y convocatorias abiertas.'
);
const SIGNUP_LABEL = WORDS('Type your email:', 'Escribe tu correo electrónico:');
const SIGNUP_ROWS = 3; // empty rows below the field, for the look of the thing
const UPLOADS_DIR = 'assets/uploads';
const IMAGES_DIR = 'assets/images';
const MONTHS = {
	en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
	es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
};

// only the archive text changes between languages, everything else is shared
const LANGUAGES = [
	{code: 'en', suffix: '', dir: '', home: '/'},
	{code: 'es', suffix: ' [ES]', dir: 'es', home: '/es/'}
];

// the four columns of the site, the one being built open and the rest collapsed
const SECTIONS = [
	{key: 'about', heading: 'ARCHIVO<br>LATINO', short: WORDS('ABOUT', 'ACERCA DE'), title: WORDS('ABOUT', 'ACERCA DE'), path: 'about/'},
	{key: 'index', heading: WORDS('CATALOG', 'CATÁLOGO'), title: WORDS('', ''), path: ''}, // the catalog is the site itself, so it carries the name alone
	{key: 'events', heading: WORDS('EVENTS', 'EVENTOS'), title: WORDS('EVENTS', 'EVENTOS'), path: 'events/'},
	{key: 'notes', heading: WORDS('JOURNAL', 'REVISTA'), title: WORDS('JOURNAL', 'REVISTA'), path: 'journal/'}
];

const SHUFFLE_ICON = `<svg viewBox="0 0 17 14"><path d="M13.76 6.896C14.32 6.4 15.184 5.888 16.304 5.36V6.288C14.992 7.408 14.032 8.592 13.424 9.808H12.96C12.352 8.592 11.376 7.408 10.08 6.288V5.36C11.184 5.888 12.048 6.4 12.624 6.896V6.88C12.624 3.696 10.048 1.136 6.88 1.136C3.696 1.136 1.136 3.696 1.136 6.88C1.136 10.064 3.696 12.624 6.88 12.624C9.072 12.624 10.768 11.376 11.504 10.288L12.352 11.04C11.344 12.48 9.312 13.76 6.88 13.76C3.072 13.76 0 10.688 0 6.88C0 3.072 3.072 0 6.88 0C10.688 0 13.76 3.072 13.76 6.88V6.896Z"/></svg>
`;
const DOWNLOAD_ICON = `<svg viewBox="0 0 15 15"><path class="cls-1" d="M8.06,1.91h-1.14v6.51c-.56-.5-1.42-1.01-2.54-1.54v.93c1.31,1.12,2.27,2.29,2.9,3.52h-2.9v1.14h6.24v-1.14h-2.9c.62-1.23,1.58-2.4,2.9-3.52v-.93c-1.14.53-2,1.04-2.56,1.55V1.91Z"/></svg>`;

// uploads keep their original names, generated files get url safe ones
function slugify(name) {
	return name
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function escapeHtml(text) {
	return String(text == null ? '' : text)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

// translations fall back to English whenever they're missing or empty
function field(entry, key, suffix) {
	let value = entry[key + suffix];
	if (value == null || String(value).trim() == '') {
		value = entry[key];
	}
	return value;
}

// a file's name without its folders, and without its extension, as node's path module would give them
function baseName(file) {
	return String(file).split(/[\\/]/).pop();
}
function fileStem(file) {
	return baseName(file).replace(/\.[^.]*$/, '');
}

function imageName(file) {
	return slugify(fileStem(file));
}

// the cms preview can hand pictures that have not been built yet to a source of its own
let imageSource = null;
function setImageSource(source) {
	imageSource = source;
}

function imageUrl(file, size) {
	if (!file) {
		return '';
	}
	let url = imageSource && imageSource(file, size);
	if (url) {
		return url;
	}
	return `/${IMAGES_DIR}/${imageName(file)}-${size}.webp`;
}

// 2021-02-06 reads as 06 February 2021 and 2021-02 as February 2021, parsed by hand to dodge time zones
function formatDate(value, code) {
	let parts = String(value == null ? '' : value).split('-');
	if (parts.length < 2 || parts.length > 3) {
		return escapeHtml(value);
	}
	let month = MONTHS[code][Number(parts[1]) - 1];
	if (!month) {
		return escapeHtml(value);
	}
	if (parts.length == 2) {
		return `${month} ${parts[0]}`;
	}
	return `${parts[2]} ${month} ${parts[0]}`;
}

// the yellow paper tint is asked for per picture rather than worked out from its type
function hasTint(image) {
	return !!(image && image.Tint);
}

// where a link goes if it is followed rather than clicked: the query the page would write
function entryHref(language, view, code) {
	return escapeHtml(code ? `${language.home}?view=${view}&code=${encodeURIComponent(code)}` : language.home);
}

// the picture standing for an entry in the list and the image view
function coverImage(entry) {
	let code = entry.Thumbnail;
	let archive = entry.Archive || [];
	return archive.find(image => image.Code == code) || archive[0] || null;
}

// everything the entry overlay needs, already in the language of the page
function archiveData(entries, language, sizes) {
	return entries.map(entry => {
		let images = (entry.Archive || []).map(image => {
			let full = sizes[image.File] && sizes[image.File].full;
			return {
				code: image.Link || image.Code || '',
				label: image.Code || '',
				type: field(image, 'Type', language.suffix) || '',
				tint: hasTint(image),
				src: imageUrl(image.File, 'full'),
				width: full ? full.width : 0,
				height: full ? full.height : 0,
				download: `/${UPLOADS_DIR}/${encodeURIComponent(image.File)}`
			};
		});
		return {
			name: field(entry, 'Addressee', language.suffix),
			place: `${field(entry, 'City', language.suffix)}, ${field(entry, 'Country', language.suffix)}`,
			date: formatDate(field(entry, 'Date', language.suffix), language.code),
			images: images
		};
	});
}

// a newline inside a value is a line break in the copy, not a new paragraph
function escapeLines(text) {
	return escapeHtml(text).replace(/\r?\n/g, '<br>');
}

// a text from one of the cms's rich text fields is read as markdown, anything else is set as it is
function wrapLines(values, indent, tag, className, markdown) {
	let list = (Array.isArray(values) ? values : [values]).map(item => {
		// a list of single-field items, which is one of the shapes a cms list can be saved in
		if (item && typeof item == 'object') {
			let first = Object.values(item)[0];
			return typeof first == 'string' ? first : '';
		}
		return item;
	});
	let attribute = className ? ` class="${className}"` : '';
	return list
		// a blank line in a text starts a new paragraph, a single line break stays inside one
		.flatMap(text => String(text == null ? '' : text).split(/\r?\n\s*\r?\n/))
		.map(text => text.trim())
		.filter(text => text != '')
		.map(text => `${indent}<${tag}${attribute}>${markdown ? inlineMarkdown(text) : escapeLines(text)}</${tag}>`)
		.join('\n');
}

// paragraphs sit an empty line apart, lines run straight on from each other. paragraphs are what
// the rich text fields hold, so they are read as markdown
function paragraphs(values, indent, className) {
	return wrapLines(values, indent, 'p', className, true);
}

function lines(values, indent) {
	return wrapLines(values, indent, 'div');
}

// a page's own greeting is the first paragraph of its intro, written into the same text
function introParagraphs(owner, language, indent) {
	return paragraphs(field(owner, 'Intro', language.suffix), indent);
}

// a section can carry a short form of its heading, and the stylesheet picks between them
function sectionHeading(section, language) {
	let heading = say(section.heading, language);
	if (!section.short) {
		return heading;
	}
	return `<span class="section-heading-full">${heading}</span><span class="section-heading-short">${say(section.short, language)}</span>`;
}

// every page carries all four columns, the collapsed ones cropped to a sliver of the real page. they are divs with a link laid over them, since anchors cannot nest
function pageShell(language, key, contents, after) {
	let page = SECTIONS.find(section => section.key == key);
	let sections = SECTIONS.map(section => {
		let content = contents[section.key] || '';
		let heading = sectionHeading(section, language);
		if (section.key == key) {
			return `		<main class="section ${section.key}" data-active="1">
			<h1 class="section-heading">${heading}</h1>

			<div class="section-content">
${content}
			</div>
		</main>`;
		}
		let href = section.path == null ? '#' : `${language.home}${section.path}`;
		return `		<div class="section ${section.key}" data-active="0">
			<div class="section-heading">${heading}</div>

			<div class="section-content" inert>
${content}
			</div>

			<a href="${href}" class="section-link"></a>
		</div>`;
	}).join('\n\n');

	let navLinks = NAV_LINKS.map(link => {
		let section = SECTIONS.find(item => item.key == link.key);
		let href = section.path == null ? '#' : `${language.home}${section.path}`;
		return `				<a href="${href}" class="nav-link">${say(link.label, language)}</a>`;
	}).join('\n');

	let nav = `	<div class="nav" data-active="0">
		<a href="#" class="nav-bar">
			<div class="nav-title">${NAV_TITLE}</div>

			<div class="nav-open">${OPEN_CLOSE}</div>
		</a>

		<div class="nav-menu">
${navLinks}

			<div class="nav-language">
				<div class="nav-language-row">
					<span>${say(LANGUAGE_LABEL, language)}</span>

					<span class="nav-language-links"><a href="/${page.path}" data-active="${language.code == 'en' ? 1 : 0}">${LANGUAGE_NAMES.en}</a> / <a href="/es/${page.path}" data-active="${language.code == 'es' ? 1 : 0}">${LANGUAGE_NAMES.es}</a></span>
				</div>
			</div>
		</div>
	</div>`;

	// the index carries the site name alone, every other page adds its own
	let title = escapeHtml([SITE_NAME, say(page.title, language)].filter(part => part).join(' '));
	let description = escapeHtml(say(SITE_DESCRIPTION, language));
	let url = `${SITE_URL}${language.home}${page.path}`;

	return `<!DOCTYPE html>
<html lang="${language.code}">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${title}</title>
	<meta name="description" content="${description}">
	<link rel="icon" type="image/png" sizes="32x32" href="/${META_DIR}/favicon.png">
	<!-- the webclip is the icon a phone keeps: ios takes it for the home screen, android for its own tile -->
	<link rel="apple-touch-icon" href="/${META_DIR}/${WEBCLIP_FILE}">
	<link rel="icon" type="image/png" sizes="256x256" href="/${META_DIR}/${WEBCLIP_FILE}">

	<meta property="og:type" content="website">
	<meta property="og:site_name" content="${SITE_NAME}">
	<meta property="og:title" content="${title}">
	<meta property="og:description" content="${description}">
	<meta property="og:url" content="${url}">
	<meta property="og:image" content="${SITE_URL}/${IMAGES_DIR}/${OG_FILE}">
	<meta property="og:image:type" content="image/jpeg">
	<meta property="og:image:width" content="${OG_WIDTH}">
	<meta property="og:image:height" content="${OG_HEIGHT}">
	<meta property="og:image:alt" content="${escapeHtml(SITE_NAME)}">
	<meta property="og:locale" content="${language.code == 'es' ? 'es_ES' : 'en_US'}">
	<meta name="twitter:card" content="summary_large_image">
	<meta name="twitter:image" content="${SITE_URL}/${IMAGES_DIR}/${OG_FILE}">

	<link rel="stylesheet" href="/style.css">
	<script>
		// an invite or recovery link from the cms lands here with its token, and is sent on to spend it
		if (/(invite_token|recovery_token|email_change_token)=/.test(location.hash)) {
			location.replace('/admin/' + location.hash);
		}
	</script>
</head>
<body>

${nav}

	<div class="container" data-page="${key}">
${sections}

		<div class="lang">
			<a href="/${page.path}" class="lang-toggle" data-active="${language.code == 'en' ? 1 : 0}">EN</a>
			<a href="/es/${page.path}" class="lang-toggle" data-active="${language.code == 'es' ? 1 : 0}">ES</a>
		</div>
	</div>
${after}
	<script src="/idle.js"></script>
</body>
</html>
`;
}

function aboutContent(about, language) {
	let what = about.What || {};
	let team = about.Team || {};
	let members = (team.Members || []).map(member => `						<div class="about-expand" data-active="0">
							<a href="#" class="about-toggle">${escapeHtml(member.Name)}${OPEN_CLOSE}</a>
							<div class="about-role">${escapeHtml(field(member, 'Role', language.suffix))}</div>

							<div class="about-hidden">
${paragraphs(field(member, 'Bio', language.suffix), '								')}
							</div>
						</div>`).join('\n\n');

	let contact = about.Contact || {};
	let legal = about.Legal || {};
	let policyList = legal.Policies || [];
	let policies = policyList.map(policy => `							<div><a href="#" class="about-policy" data-policy="${slugify(policy.Label)}">${escapeHtml(field(policy, 'Label', language.suffix))}</a></div>`).join('\n');
	let popups = policyList.map(policy => `					<div class="about-popup" data-policy="${slugify(policy.Label)}" data-active="0">
						<div class="about-popup-head">
							<span>${escapeHtml(field(policy, 'Label', language.suffix))}</span>
							<a href="#" class="about-popup-close">${MARK('×')}</a>
						</div>

						<div class="about-popup-body">
							<div class="about-popup-text">
${paragraphs(field(policy, 'Text', language.suffix), '								')}
							</div>
						</div>
					</div>`).join('\n\n');

	// the picture is named in the json like every other image, and converted like them too
	let imageFile = about.Image && about.Image.File;
	let aboutImage = imageFile ? `						<img src="${imageUrl(imageFile, 'full')}" alt="">` : '';

	// the rules are drawn first so the picture sits in front of them rather than behind
	let content = `				<div class="about-gridlines">
					<div class="dotted-right"></div>
					<div class="dotted-right"></div>
					<div class="dotted-right"></div>
				</div>

				<div class="about-columns">
					<div class="about-image">
${aboutImage}
					</div>

					<div class="about-column">
						<h2 class="about-heading">${say(WHAT_HEADING, language)}</h2>

${paragraphs(field(what, 'Intro', language.suffix), '						')}

						<div class="about-expand" data-active="0">
							<a href="#" class="about-toggle">${say(READ_MORE, language)}${OPEN_CLOSE}</a>

							<div class="about-hidden">
${paragraphs(field(what, 'More', language.suffix), '								')}
							</div>
						</div>
					</div>

					<div class="about-column">
						<h2 class="about-heading">${say(WHO_HEADING, language)}</h2>

${paragraphs(field(team, 'Intro', language.suffix), '						')}

${members}

						<div class="about-contact">
							<h2 class="about-heading">${say(CONTACT_HEADING, language)}</h2>

							<div class="about-lines">
								<div><a class="about-link" href="mailto:${escapeHtml(contact.Email)}">${escapeHtml(contact.Email)}</a></div>
								<div><a class="about-link" href="${escapeHtml(contact['Instagram URL'])}" target="_blank" rel="noopener">${escapeHtml(contact.Instagram)}</a></div>
							</div>

							<div class="about-legal">
								<div class="about-lines">
	${wrapLines(say(COPYRIGHT, language).map(line => line.replace('YEAR', new Date().getFullYear())), '									', 'div', 'about-copyright')}
									<div><a class="about-link" href="${CREDIT_URL}" target="_blank" rel="noopener">${escapeHtml(say(CREDIT, language))}</a></div>
	${policies.split('\n').map(line => '\t\t' + line).join('\n')}
								</div>
							</div>
						</div>
					</div>

					<div class="about-column about-spacer"></div>

					<div class="about-column about-spacer"></div>

${popups}
				</div>`;

	return content;
}

/* events */

// build time, in local time rather than utc so the day does not slip
function today() {
	let now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// every iso date anywhere in an event, whatever the type calls its fields
function eventDates(value, found) {
	found = found || [];
	if (typeof value == 'string') {
		if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
			found.push(value);
		}
	} else if (Array.isArray(value)) {
		for (let item of value) eventDates(item, found);
	} else if (value && typeof value == 'object') {
		for (let item of Object.values(value)) eventDates(item, found);
	}
	return found.sort();
}

function firstDate(event) {
	let dates = eventDates(event);
	return dates.length ? dates[0] : '';
}

function lastDate(event) {
	let dates = eventDates(event);
	return dates.length ? dates[dates.length - 1] : '';
}

// 14 March – 04 April 2026, dropping the year from the first date when it repeats
function formatRange(start, end, code) {
	let from = formatDate(start, code);
	if (String(start).slice(0, 4) == String(end).slice(0, 4)) {
		from = from.replace(/ \d{4}$/, '');
	}
	return `${from} – ${formatDate(end, code)}`;
}

// an open call's dates read as when it opens and closes rather than when it is on view
function isOpenCall(event) {
	return String(event.Type || '').trim().toLowerCase() == 'open call';
}

// how the dates read follows from what is filled in: a start alone is a single day, a start and an
// end are a run on view, or the opening and closing of an open call
function eventLines(event, language) {
	let labels = EVENT_LABELS[language.code];
	let dates = event.Dates || {};
	let out = [];
	if (dates.Reception) {
		let time = dates['Reception Time'] ? `, ${dates['Reception Time']}` : '';
		out.push(`${labels.Reception}: ${formatDate(dates.Reception, language.code)}${time}`);
	}
	let range = dates.Start && dates.End;
	if (range && !isOpenCall(event)) {
		out.push(`${labels['On View']}: ${formatRange(dates.Start, dates.End, language.code)}`);
	}
	if (event.Collaborator) {
		out.push(`${labels.Collaborator}: ${field(event, 'Collaborator', language.suffix)}`);
	}
	if (dates.Start && !dates.End) {
		out.push(`${labels.Date}: ${formatDate(dates.Start, language.code)}`);
	}
	if (range && isOpenCall(event)) {
		out.push(`${labels.Opens}: ${formatDate(dates.Start, language.code)}`);
		out.push(`${labels.Closes}: ${formatDate(dates.End, language.code)}`);
	}
	let location = field(event, 'Location', language.suffix);
	if (location) {
		out.push(`${labels.Location}: ${location}`);
	}
	return out;
}

// thumbnail, blurb, expanded description and submit link are all optional
function eventBlock(event, language, sizes) {
	let parts = [];
	parts.push(`						<div class="events-title"><span class="events-title-text"><span class="events-type">${escapeHtml(field(event, 'Type', language.suffix))}</span>: <span class="events-name">${escapeHtml(field(event, 'Name', language.suffix))}</span></span></div>`);

	let details = eventLines(event, language);
	if (details.length) {
		parts.push(`						<div class="events-lines">\n${lines(details, '							')}\n						</div>`);
	}

	// what an open call is asking for, on dotted paper with a line of text to each row. every open call
	// gets the paper, so one saved without a request still has it, with that row left empty
	let request = field(event, 'Request', language.suffix);
	if (request || isOpenCall(event)) {
		parts.push(`						<div class="events-request">
							<div class="events-request-row">${say(REQUEST_LABEL, language)}</div>
							<div class="events-request-row">${escapeHtml(request)}</div>
							<div class="events-request-row"></div>
							<div class="events-request-row"></div>
							<div class="events-request-row">${escapeHtml(field(event, 'Name', language.suffix))}</div>
						</div>`);
	}

	let file = event.Thumbnail && event.Thumbnail.File;
	if (file) {
		let size = sizes[file] && sizes[file].thumb;
		let dimensions = size ? ` width="${size.width}" height="${size.height}"` : '';
		// the picture opens the event: its view when it has one, otherwise its description
		let view = event.View ? ` data-view="${slugify(event.Name)}"` : '';
		parts.push(`						<a href="#" class="events-thumb-link"${view}><img class="events-thumb" src="${imageUrl(file, 'thumb')}"${dimensions} alt="" loading="lazy"></a>`);
	}

	let blurb = field(event, 'Blurb', language.suffix);
	if (blurb) {
		parts.push(`						<div class="events-blurb">\n${paragraphs(blurb, '							')}\n						</div>`);
	}

	let description = field(event, 'Description', language.suffix);
	if (description && description.length) {
		parts.push(`						<a href="#" class="events-toggle"><span class="events-more">${say(READ_MORE, language)}</span><span class="events-less">${say(READ_LESS, language)}</span>${OPEN_CLOSE}</a>`);
		parts.push(`						<div class="events-hidden">\n${paragraphs(description, '							')}\n						</div>`);
	}

	if (event['Submission Link']) {
		parts.push(`						<a href="${escapeHtml(event['Submission Link'])}" class="events-submit" target="_blank" rel="noopener">${say(SUBMIT, language)}${MARK('&gt;')}</a>`);
	}

	if (event.View) {
		let type = String(field(event, 'Type', language.suffix)).toLowerCase();
		parts.push(`						<a href="#" class="events-view" data-view="${slugify(event.Name)}">${say(VIEW, language)} ${escapeHtml(type)}${MARK('&gt;')}</a>`);
	}

	return `					<div class="events-event" data-active="0">\n${parts.join('\n\n')}\n					</div>`;
}

// a filmstrip of the event's images with the details pinned to the top right, one per event that opts in
function eventView(event, language, sizes, past) {
	let images = (event.Images || []).map(image => {
		let file = image.File;
		let size = sizes[file] && sizes[file].full;
		let dimensions = size ? ` width="${size.width}" height="${size.height}"` : '';
		return `				<div class="view-image">
					<img src="${imageUrl(file, 'full')}"${dimensions} alt="" loading="lazy">
				</div>`;
	}).join('\n');

	let rows = [`				<div class="view-info-row view-info-name">${escapeHtml(field(event, 'Name', language.suffix))}</div>`];
	// the card below the breakpoint names one date, where the lines below spell out receptions and ranges
	rows.push(`				<div class="view-info-row view-info-date">${formatDateCard(firstDate(event), language.code)}</div>`);
	for (let line of eventLines(event, language)) {
		rows.push(`				<div class="view-info-row view-info-line">${escapeHtml(line)}</div>`);
	}

	// the blurb keeps a class of its own, so the description can be set further from it
	let blurb = paragraphs(field(event, 'Blurb', language.suffix), '						', 'view-info-blurb');
	let description = paragraphs(field(event, 'Description', language.suffix) || [], '						');
	let information = [blurb, description].filter(part => part != '').join('\n');
	if (information) {
		rows.push(`				<div class="view-info-row view-expand" data-active="0">
					<a href="#" class="view-info-toggle">${say(INFORMATION, language)}${OPEN_CLOSE}</a>

					<div class="view-info-hidden">
${information}
					</div>
				</div>`);
	}

	let label = VIEW_TITLE[language.code](escapeHtml(field(event, 'Type', language.suffix)), past);

	return `	<div class="view" data-view="${slugify(event.Name)}" data-active="0">
		<a href="#" class="view-close">${MARK('×')}</a>

		<div class="view-images">
			<div class="view-strip">
${images}
			</div>
		</div>

		<div class="view-nav">
			<a href="#" class="view-prev">${MARK('&lt;')} PREVIOUS</a> / <a href="#" class="view-next">NEXT${MARK('&gt;')}</a>
		</div>

		<div class="view-info">
			<div class="view-info-title">${label}</div>

			<div class="view-info-rows">
${rows.join('\n\n')}
			</div>
		</div>
	</div>`;
}

// the month the calendar opens on, rendered here so it is right before any script runs
function calendarDays(dates, code) {
	let now = new Date();
	let year = now.getFullYear();
	let month = now.getMonth();
	let count = new Date(year, month + 1, 0).getDate();
	let out = [];
	for (let day = 1; day <= count; day++) {
		let padded = String(day).padStart(2, '0');
		let stamp = `${year}-${String(month + 1).padStart(2, '0')}-${padded}`;
		out.push(`							<span data-event="${dates.includes(stamp) ? 1 : 0}">${padded}</span>`);
	}
	return {
		heading: `${MONTHS[code][month]} ${year}`.toUpperCase(),
		days: out.join('\n')
	};
}

// an archived event stays in the cms and keeps its gallery, but leaves the listing and the calendar
function listedEvents(events) {
	return (events || []).filter(event => !event.Archived);
}

function eventsContent(data, language, sizes) {
	let events = listedEvents(data.Events);
	let now = today();
	let upcoming = events.filter(event => lastDate(event) >= now).sort((a, b) => firstDate(a).localeCompare(firstDate(b)));
	let past = events.filter(event => lastDate(event) < now).sort((a, b) => firstDate(b).localeCompare(firstDate(a)));
	let dates = events.map(firstDate).filter(date => date);
	let calendar = calendarDays(dates, language.code);

	let list = group => group.map(event => eventBlock(event, language, sizes)).join('\n\n');
	// the upcoming list says so when it is empty, where the next event would otherwise be
	let upcomingList = upcoming.length ? list(upcoming) : `								<p class="events-empty">${say(NO_UPCOMING, language)}</p>`;

	return `				<div class="events-columns">
					<div class="events-column events-info">
						<div class="events-intro">
${introParagraphs(data, language, '							')}
						</div>

						<div class="events-calendar">
							<div class="events-calendar-month">${calendar.heading}</div>

							<div class="events-calendar-days">
${calendar.days}
							</div>

							<div class="events-calendar-nav">
								<a href="#" class="events-prev">${MARK('&lt;')} PREVIOUS</a> / <a href="#" class="events-next">NEXT${MARK('&gt;')}</a>
							</div>
						</div>
					</div>

					<div class="events-listing">
						<div class="events-group">
							<h2 class="events-heading">${say(UPCOMING_HEADING, language)}</h2>

							<div class="events-list">
${upcomingList}
							</div>
						</div>

						<div class="events-group">
							<h2 class="events-heading">${say(PAST_HEADING, language)}</h2>

							<div class="events-list">
${list(past)}
							</div>
						</div>
					</div>
				</div>

				<div class="events-gridlines">
					<div class="dotted-right"></div>
					<div class="dotted-right"></div>
				</div>`;
}

function eventsExtras(events, language, sizes) {
	let data = JSON.stringify({
		months: MONTHS[language.code],
		dates: listedEvents(events).map(firstDate).filter(date => date)
	}).replace(/</g, '\\u003c');
	let now = today();
	let views = events
		.filter(event => event.View)
		.map(event => eventView(event, language, sizes, lastDate(event) < now))
		.join('\n\n');
	return `
	<div class="view-backdrop" data-active="0"></div>

${views}

	<script type="application/json" id="events-data">${data}</script>
	<script src="/nav.js"></script>
	<script src="/events.js"></script>`;
}


function aboutExtras(language) {
	let rows = Array(SIGNUP_ROWS).fill('		<div class="signup-row"></div>').join('\n');
	// a netlify form: netlify finds it in the page when the site is deployed and keeps what is sent to
	// it. the hidden field names the form, and the one set aside is a trap left empty by people and
	// filled in by the bots that fill in everything
	return `
	<form class="signup" name="${SIGNUP_FORM}" method="POST" data-netlify="true" netlify-honeypot="company" data-active="1">
		<input type="hidden" name="form-name" value="${SIGNUP_FORM}">
		<p hidden><label>Leave this empty: <input name="company" tabindex="-1" autocomplete="off"></label></p>

		<div class="signup-top">
			<div class="signup-head">
				<span>${say(SIGNUP_TEXT, language)}</span>
				<a href="#" class="signup-close">${MARK('×')}</a>
			</div>

			<div class="signup-label">${say(SIGNUP_LABEL, language)}</div>
		</div>

		<input type="email" name="email" class="signup-field" autocomplete="email" aria-label="${say(SIGNUP_LABEL, language)}">

${rows}

		<div class="signup-foot">
			<a href="#" class="signup-submit" data-state="idle"><span class="signup-send">${say(SUBMIT, language)}${MARK('&gt;')}</span><span class="signup-sent">${say(SIGNUP_THANKS, language)}</span><span class="signup-invalid">${say(SIGNUP_INVALID, language)}</span><span class="signup-error">${say(SIGNUP_ERROR, language)}</span></a>
		</div>
	</form>

	<script src="/nav.js"></script>
	<script src="/about.js"></script>`;
}

/* notes */

// the whole block is the link to the article, and the mark after the last of the author names is
// what lights up under the pointer. a draft is set out here like the rest but never linked to: it
// is reached by its own address alone
function notesArticle(article, language, issue) {
	let draft = !!article.Draft;
	let names = article.Credits || [];
	let credits = names.map((credit, i) => {
		let lead = say(i == 0 ? CREDIT_FIRST : CREDIT_REST, language);
		// one mark for the whole block, after the last of the names
		let mark = !draft && i == names.length - 1 ? MARK('&gt;') : '';
		return `								<div>${lead} ${escapeHtml(credit.Name)}${mark}</div>`;
	}).join('\n');

	// the one line introduction is optional, and an empty one leaves no gap behind
	let text = field(article, 'Blurb', language.suffix);
	let blurb = text ? `\n							<p class="notes-blurb">${escapeHtml(text)}</p>\n` : '';
	let inside = `							<h2 class="notes-heading">[${escapeHtml(field(article, 'Type', language.suffix))}]</h2>

							<div class="notes-title">${escapeHtml(field(article, 'Title', language.suffix))}</div>

${blurb}
							<div class="notes-lines">
${credits}
							</div>`;

	if (draft) {
		return `						<div class="notes-article" data-draft="1">
${inside}
						</div>`;
	}
	// the address opens the article on its own, and the script takes over from there
	let href = `${language.home}journal/?issue=${encodeURIComponent(issue.Number)}&article=${encodeURIComponent(articleSlug(article))}`;
	return `						<a href="${escapeHtml(href)}" class="notes-article notes-open" data-issue="${issue.Number}" data-article="${articleSlug(article)}">
${inside}
						</a>`;
}

// every issue ships in the page and the controls swap between them
function notesContent(data, language) {
	let issues = data.Issues || [];
	let notes = issues.map((issue, index) => `					<div class="notes-issue" data-index="${index}" data-issue="${issue.Number}" data-active="0">
						<h2 class="notes-heading">${say(EDITORS_NOTE, language)}</h2>

						<div class="notes-lines">
${lines([
	field(issue, 'Publication', language.suffix),
	`${say(VOLUME_LABEL, language)} ${romanNumeral(issue.Number)}: ${field(issue, 'Name', language.suffix)}`,
	field(issue, 'Season', language.suffix)
].filter(line => line), '							')}
						</div>

						<div class="notes-text">
${paragraphs(field(issue, 'Note', language.suffix), '							')}
						</div>

						<div class="notes-expand" data-active="0">
							<a href="#" class="notes-toggle"><span class="notes-more">${say(READ_MORE, language)}</span><span class="notes-less">${say(READ_LESS, language)}</span>${OPEN_CLOSE}</a>

							<div class="notes-hidden">
${paragraphs(field(issue, 'More', language.suffix), '								')}
							</div>
						</div>
					</div>`).join('\n\n');

	let articles = issues.map((issue, index) => `					<div class="notes-issue" data-index="${index}" data-issue="${issue.Number}" data-active="0">
${(issue.Articles || []).map(article => notesArticle(article, language, issue)).join('\n\n')}
					</div>`).join('\n\n');

	let intros = issues.map((issue, index) => `						<div class="notes-issue" data-index="${index}" data-issue="${issue.Number}" data-active="0">
${introParagraphs(issue, language, '							')}
						</div>`).join('\n\n');

	return `				<div class="notes-columns">
					<div class="notes-column notes-info">
						<div class="notes-intro">
${intros}
						</div>

						<div class="notes-nav" data-both="1" data-empty="${issues.length < 2 ? 1 : 0}">
							<a href="#" class="notes-prev" data-active="1">${MARK('&lt;')} ${say(PREVIOUS_ISSUE, language)}</a><span class="notes-sep"> / </span><a href="#" class="notes-next" data-active="1">${say(NEXT_ISSUE, language)}${MARK('&gt;')}</a>
						</div>
					</div>

					<div class="notes-listing">
						<div class="notes-column notes-editor">
${notes}
						</div>

						<div class="notes-column notes-articles">
${articles}
						</div>
					</div>
				</div>

				<div class="notes-gridlines">
					<div class="dotted-right"></div>
					<div class="dotted-right"></div>
				</div>`;
}

// day, month and year in capitals: 18 AUGUST 2026
function formatDateCard(value, code) {
	let parts = String(value == null ? '' : value).split('-');
	if (parts.length != 3) {
		return escapeHtml(value);
	}
	return escapeHtml(`${Number(parts[2])} ${MONTHS[code][Number(parts[1]) - 1]} ${parts[0]}`.toUpperCase());
}

// month first, as the brief writes it: August 18, 2026
function formatDateLong(value, code) {
	let parts = String(value == null ? '' : value).split('-');
	if (parts.length != 3) {
		return escapeHtml(value);
	}
	return `${MONTHS[code][Number(parts[1]) - 1]} ${Number(parts[2])}, ${parts[0]}`;
}

// slugs only have to be unique inside an issue, so both parts identify an article
function articleSlug(article) {
	return slugify(article.Title);
}

// 1 reads as I, 4 as IV, 2026 as MMXXVI
function romanNumeral(number) {
	let value = Math.floor(Number(number));
	if (!(value > 0)) {
		return escapeHtml(number);
	}
	let numerals = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
	let out = '';
	for (let [amount, numeral] of numerals) {
		while (value >= amount) {
			out += numeral;
			value -= amount;
		}
	}
	return out;
}

// the figures in a body, in order, with the path the cms writes cut back to the file's name
function bodyFigures(body) {
	return String(body || '').split(/\r?\n\s*\r?\n/)
		.map(block => block.trim().match(FIGURE_PATTERN))
		.filter(match => match)
		.map(match => ({file: baseName(match[1].trim()), caption: (match[2] || '').trim()}));
}

// the little markdown the rich text editor writes: paragraphs, links and line breaks. anything
// else it escapes with a backslash, which is undone here once the markup has been read
function inlineMarkdown(text) {
	let escapes = [];
	let out = String(text == null ? '' : text)
		.replace(/\\([\\`*_{}\[\]()#+\-.!|<>~])/g, (match, character) => {
			escapes.push(character);
			return `\u0000${escapes.length - 1}\u0000`;
		});
	// a break is a backslash, two spaces or a <br> at the end of a line
	out = out.replace(/(?:\\| {2,}|<br\s*\/?>)\r?\n/gi, '\u0001').replace(/<br\s*\/?>/gi, '\u0001');
	out = escapeHtml(out);
	// the addresses are set aside first, so nothing in one is read as anything else
	let links = [];
	out = out.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^)]*&quot;)?\)/g, (match, label, href) => {
		links.push(href);
		return `\u0003${links.length - 1}\u0003${label}\u0004`;
	});
	out = out
		// the editor offers no bold or italics, so any that get in by a shortcut are set as plain text.
		// underscores are left alone, since an instagram handle is full of them
		.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '$1')
		.replace(/\*(?=\S)([\s\S]*?\S)\*/g, '$1')
		.replace(/\r?\n/g, ' ') // a single line break in the source is only a space
		.replace(/\u0001/g, '<br>')
		.replace(/\u0003(\d+)\u0003/g, (match, index) => `<a href="${links[index]}" target="_blank" rel="noopener">`)
		.replace(/\u0004/g, '</a>');
	return out.replace(/\u0000(\d+)\u0000/g, (match, index) => escapeHtml(escapes[index]));
}

// every {{note: ...}} in the running text becomes the next numbered annotation, so they number
// themselves in the order they are read
function articleText(text, counter) {
	let notes = [];
	let marked = String(text).replace(NOTE_PATTERN, (match, note) => {
		notes.push(note);
		return `\u0002${notes.length - 1}\u0002`;
	});
	return inlineMarkdown(marked).replace(/\u0002(\d+)\u0002/g, (match, index) => {
		counter.n++;
		return `<span class="article-note">${NOTE_MARK(counter.n)}<span class="article-note-box">${NOTE_MARK(counter.n)} ${inlineMarkdown(notes[index])}</span></span>`;
	});
}

// paragraphs are split at blank lines, and a paragraph that is only a figure is set as a picture
function articleBody(article, language, sizes) {
	let counter = {n: 0};
	let body = String(field(article, 'Body', language.suffix) || '');
	return body.split(/\r?\n\s*\r?\n/).map(block => block.trim()).filter(block => block).map(block => {
		let figure = block.match(FIGURE_PATTERN);
		if (figure) {
			let file = baseName(figure[1].trim());
			let size = sizes[file] && sizes[file].full;
			let dimensions = size ? ` width="${size.width}" height="${size.height}"` : '';
			let portrait = size && size.height > size.width;
			let caption = figure[2] && figure[2].trim() ? `\n							<div class="article-caption">${inlineMarkdown(figure[2].trim())}</div>` : '';
			return `						<div class="article-figure" data-orientation="${portrait ? 'portrait' : 'landscape'}">
							<img src="${imageUrl(file, 'full')}"${dimensions} alt="" loading="lazy">${caption}
						</div>`;
		}
		return `						<p class="article-paragraph">${articleText(block, counter)}</p>`;
	}).join('\n');
}

function articleCredits(article, language) {
	return (article.Credits || []).map(credit => credit.Name).join(` ${say(CREDIT_REST, language)} `);
}

function articlePopup(issue, issueIndex, article, articleIndex, language, sizes) {
	let authors = (article.Credits || []).map(credit => `							<div class="article-author-line">
								<a href="#" class="article-author">${escapeHtml(credit.Name)}${OPEN_CLOSE}</a>

								<div class="article-bio">${escapeHtml(field(credit, 'Bio', language.suffix))}</div>
							</div>`).join('\n\n');

	let others = (issue.Articles || []).map((other, index) => {
		if (index == articleIndex) {
			return '';
		}
		let title = escapeHtml(field(other, 'Title', language.suffix));
		// a draft is named here like the rest of the issue, but carries no link and no mark
		let heading = other.Draft ? title : `<a href="#" class="article-more-link" data-issue="${issue.Number}" data-article="${articleSlug(other)}">${title}${MARK('&gt;')}</a>`;
		return `							<div class="article-more-item">
								<div>${heading}</div>
								<div>${say(CREDIT_FIRST, language)} ${escapeHtml(articleCredits(other, language))}</div>
							</div>`;
	}).filter(text => text).join('\n\n');

	return `	<div class="article" data-issue="${issue.Number}" data-article="${articleSlug(article)}" data-active="0">
		<a href="#" class="article-close">${MARK('×')}</a>

		<div class="article-issue" data-short="0"><span class="article-issue-label">[${say(VOLUME_LABEL, language)} ${romanNumeral(issue.Number)}<span class="article-issue-name">, ${escapeHtml(field(issue, 'Name', language.suffix))}</span>]</span></div>

		<div class="article-holes">
			<div class="article-hole"></div>
			<div class="article-hole"></div>
			<div class="article-hole"></div>
		</div>

		<div class="article-scroll">
		<div class="article-head">
			<div class="article-box" data-active="0">
				<h2 class="article-type">[${escapeHtml(field(article, 'Type', language.suffix))}]</h2>

				<div class="article-title">${escapeHtml(field(article, 'Title', language.suffix))}</div>
				<div class="article-date">[${formatDateLong(article.Date, language.code)}]</div>

${authors}
			</div>
		</div>

		<div class="article-body">
${articleBody(article, language, sizes)}

			<div class="article-end">
				<div class="article-rule"></div>
${others ? `
				<div class="article-more">
					<div class="article-more-heading">${say(MORE_FROM_ISSUE, language)}</div>

${others}
				</div>` : ''}
			</div>
		</div>
		</div>
	</div>`;
}

function notesExtras(issues, language, sizes) {
	let popups = issues.map((issue, i) => (issue.Articles || []).map((article, a) => articlePopup(issue, i, article, a, language, sizes)).join('\n\n')).join('\n\n');
	return `
	<div class="article-backdrop" data-active="0"></div>

${popups}

	<script src="/nav.js"></script>
	<script src="/journal.js"></script>`;
}




function indexLink(entry, index, language, sizes) {
	let cover = coverImage(entry);
	let file = cover && cover.File;
	let thumbnail = imageUrl(file, 'thumb');
	// the preview box is sized to the picture rather than the picture fitted to the box
	let size = sizes && sizes[file] && sizes[file].thumb;
	let ratio = size && size.height ? size.width / size.height : 1;
	let cells = COLUMNS.map(column => {
		let value = field(entry, column, language.suffix);
		if (column == 'Date') {
			// the written date is translated, so sorting reads the raw one instead
			return `						<span class="index-date" data-sort="${escapeHtml(value)}"><span class="index-date-full">${formatDate(value, language.code)}</span><span class="index-date-year">${escapeHtml(String(value).slice(0, 4))}</span></span>`;
		}
		return `						<span>${escapeHtml(value)}</span>`;
	});
	// a row opens on the entry's thumbnail, which is where its link points too
	let photo = Math.max(0, (entry.Archive || []).indexOf(cover));
	return `					<a href="${entryHref(language, 'list', cover && cover.Link)}" class="index-list-link" data-entry="${index}" data-photo="${photo}" data-thumbnail="${thumbnail}" data-ratio="${Math.round(ratio * 10000) / 10000}" data-tint="${hasTint(cover) ? 1 : 0}">
${cells.join('\n')}
					</a>`;
}

// shown a whole column wide, so these take the full sized render rather than the small one
// one card per picture rather than per entry, each opening the overlay on its own image
function indexImage(entry, index, image, photo, language, sizes) {
	let file = image.File;
	let size = sizes[file] && sizes[file].full;
	let dimensions = size ? ` width="${size.width}" height="${size.height}"` : '';
	let city = field(entry, 'City', language.suffix);
	let country = field(entry, 'Country', language.suffix);
	let tinted = hasTint(image);
	let tint = tinted ? ` style="--tint: url('${imageUrl(file, 'full')}')"` : '';
	return `					<a href="${entryHref(language, 'image', image.Link)}" class="index-image" data-entry="${index}" data-photo="${photo}" data-tint="${tinted ? 1 : 0}"${tint}>
						<span class="index-image-crop"><img class="index-image-thumb" src="${imageUrl(file, 'full')}"${dimensions} alt="" loading="lazy"></span>

						<div class="index-image-info">
							<span>[${escapeHtml(image.Code || '')}] ${escapeHtml(city)}, ${escapeHtml(country)}</span>
							<span>[+]</span>
						</div>
					</a>`;
}

function indexContent(entries, language, sizes) {
	let links = entries.map((entry, index) => indexLink(entry, index, language, sizes)).join('\n');
	let images = entries.flatMap((entry, index) => (entry.Archive || []).map((image, photo) => indexImage(entry, index, image, photo, language, sizes))).join('\n');
	let data = JSON.stringify(archiveData(entries, language, sizes)).replace(/</g, '\\u003c');
	// the labels are carried as data too, since sorting rewrites the heading to add its arrows
	let full = COLUMN_LABELS[language.code];
	let shorts = MOBILE_COLUMNS[language.code];
	let headings = COLUMNS.map((column, index) => {
		let long = full[index];
		let short = shorts[index];
		let label = short == long ? `[${long}]` : `<span class="index-heading-full">[${long}]</span><span class="index-heading-short">[${short}]</span>`;
		return `						<h2 class="index-list-heading" data-label="${long}" data-short="${short}">${label}</h2>`;
	}).join('\n');
	let content = `				<div class="index-controls">
					<a href="#" class="index-shuffle" data-active="0"><span class="index-shuffle-label">${say(SHUFFLE_LABEL, language)}</span>${SHUFFLE_ICON}</a>
					<div class="index-views">
						<a href="#" class="index-view" data-view="list" data-active="1">${say(LIST_LABEL, language)}</a> / <a href="#" class="index-view" data-view="image" data-active="0">${say(IMAGE_LABEL, language)}</a>
					</div>
				</div>

				<div class="index-list" data-active="1">

					<div class="index-list-headings">
${headings}

						<div class="index-sort" data-active="0">
							<a href="#" class="index-sort-toggle">${say(SORT_LABEL, language)}${TOGGLE_MARK('⌄', '^')}</a>

							<div class="index-sort-menu">
${shorts.map((column, index) => `								<a href="#" class="index-sort-option" data-column="${index}">${column}</a>`).join('\n')}
							</div>
						</div>

						<h2 class="index-list-heading index-select">${say(SELECT_ONE, language)}</h2>
					</div>

					<div class="index-list-links">
${links}
					</div>
				</div>

				<div class="index-images" data-active="0">
${images}
				</div>

				<div class="index-preview" data-active="0">
					<span class="index-preview-crop"><img class="index-preview-image" alt=""></span>
				</div>

				<div class="index-list-gridlines" data-active="1">
					<div class="dotted-right"></div>
					<div class="dotted-right"></div>
					<div class="dotted-right"></div>
					<div class="dotted-right"></div>
				</div>

				<div class="index-images-gridlines" data-active="0">
					<div class="dotted-right"></div>
					<div class="dotted-right"></div>
				</div>`;

	return content;
}

// the overlay and the archive payload only ship on the page where the index is open
function indexExtras(entries, language, sizes) {
	let data = JSON.stringify(archiveData(entries, language, sizes)).replace(/</g, '\\u003c');
	return `
	<div class="entry-backdrop" data-active="0"></div>

	<div class="entry" data-active="0">
		<div class="entry-info">
			<a href="#" class="entry-close">${MARK('×')}</a>

			<div class="entry-text">
				<div class="entry-line">
					<span class="entry-code"></span>
					<a class="entry-download" download title="${say(DOWNLOAD_LABEL, language)}">${DOWNLOAD_ICON}</a>
				</div>
				<div class="entry-line entry-name"></div>
				<div class="entry-line entry-place"></div>
				<div class="entry-line entry-type"></div>
				<div class="entry-line entry-date"></div>
			</div>

			<div class="entry-count"></div>
		</div>

		<div class="entry-media">
			<div class="entry-track"></div>

			<div class="entry-nav">
				<a href="#" class="entry-nav-prev">[<span class="mark">&lt;</span>]<span class="entry-nav-label"> ${say(PREVIOUS_LABEL, language)}</span></a><span class="entry-nav-label"> / </span><a href="#" class="entry-nav-next"><span class="entry-nav-label">${say(NEXT_LABEL, language)} </span>[<span class="mark"><span class="entry-nav-across">&gt;</span><span class="entry-nav-down">⌄</span></span>]</a>
			</div>
		</div>
	</div>

	<!-- one picture in the strip, stamped out as many times as the strip needs to repeat -->
	<template id="entry-slide">
		<div class="entry-slide" data-active="0" data-panning="0">
			<div class="entry-frame" data-zoom="1" data-tint="0">
				<div class="entry-scroll">
					<img class="entry-photo" alt="">
				</div>
				<div class="entry-zoom">[<a href="#" class="entry-zoom-out">-</a>/<a href="#" class="entry-zoom-in">+</a>]</div>
			</div>
		</div>
	</template>

	<script type="application/json" id="archive-data">${data}</script>
	<script src="/nav.js"></script>
	<script src="/index.js"></script>`;
}

// ?code= can only resolve if no two pictures share a code
function linkCodes(entries) {
	let seen = new Map();
	let shared = [];
	for (let entry of entries) {
		for (let image of entry.Archive || []) {
			let count = seen.get(image.Code) || 0;
			seen.set(image.Code, count + 1);
			// the first of a shared code keeps the address it already had
			image.Link = count ? `${image.Code}-${String(count).padStart(2, '0')}` : image.Code;
			if (count) {
				shared.push(`${image.Code} → ${image.Link} ("${entry.Addressee}")`);
			}
		}
	}
	return shared;
}

// the cms writes a picture's path from the site root, the spreadsheet writes its name alone, and
// everything downstream wants the name
function normaliseFiles(value) {
	if (Array.isArray(value)) {
		value.forEach(normaliseFiles);
	} else if (value && typeof value == 'object') {
		for (let key of Object.keys(value)) {
			if (key == 'File' && typeof value[key] == 'string') {
				value[key] = baseName(value[key]);
			} else {
				normaliseFiles(value[key]);
			}
		}
	}
	return value;
}

// the four files as read, set up the way every page wants them. the pictures' paths are cut back
// to their names, the catalog is put in date order and every picture is given its address
// entries received in the same month keep the order of their letters, L00001 before L00015, and
// a batch without a letter follows the ones with, by its first code. each entry is a file of its
// own, so there is no other order to keep, and the first of two pictures sharing a code keeps the
// plain address by this order
function catalogOrder(entry) {
	let codes = (entry.Archive || []).map(image => String(image.Code || ''));
	let letter = codes.find(code => /^L\d/.test(code));
	let code = letter || codes[0] || '';
	let number = parseFloat(code.replace(/^[A-Z]+/i, '')) || 0;
	return (letter ? 0 : 1e9) + number;
}

// a draft issue is left off the site altogether. the cms preview asks for drafts to be kept, so an
// issue can be seen while it is being written
function prepareContent(data, options) {
	for (let key of Object.keys(data)) {
		normaliseFiles(data[key]);
	}
	if (!(options && options.drafts)) {
		data.journal.Issues = (data.journal.Issues || []).filter(issue => !issue.Draft);
	}
	let entries = data.catalog.Entries || [];
	// the index sorts by date in the page, and its collapsed preview elsewhere runs no script, so the markup carries the order
	entries.sort((a, b) => String(b['Date']).localeCompare(String(a['Date'])) || catalogOrder(a) - catalogOrder(b));
	return linkCodes(entries);
}

// the four pages in one language. every page carries every column's content, so the collapsed ones show a crop
function renderPages(data, language, sizes) {
	let entries = data.catalog.Entries || [];
	let events = data.events.Events || [];
	let issues = data.journal.Issues || [];
	let contents = {
		index: indexContent(entries, language, sizes),
		about: aboutContent(data.about, language),
		events: eventsContent(data.events, language, sizes),
		notes: notesContent(data.journal, language)
	};
	return {
		index: pageShell(language, 'index', contents, indexExtras(entries, language, sizes)),
		about: pageShell(language, 'about', contents, aboutExtras(language)),
		events: pageShell(language, 'events', contents, eventsExtras(events, language, sizes)),
		notes: pageShell(language, 'notes', contents, notesExtras(issues, language, sizes))
	};
}


Object.assign(exports, {
	WORDS,
	say,
	READ_MORE,
	MARK,
	TOGGLE_MARK,
	OPEN_CLOSE,
	READ_LESS,
	UPCOMING_HEADING,
	NO_UPCOMING,
	isOpenCall,
	listedEvents,
	PAST_HEADING,
	SUBMIT,
	REQUEST_LABEL,
	SIGNUP_THANKS,
	SIGNUP_INVALID,
	SIGNUP_ERROR,
	SIGNUP_FORM,
	VIEW,
	INFORMATION,
	VIEW_TITLE,
	EDITORS_NOTE,
	VOLUME_LABEL,
	PREVIOUS_ISSUE,
	NEXT_ISSUE,
	CREDIT_FIRST,
	CREDIT_REST,
	MORE_FROM_ISSUE,
	NOTE_PATTERN,
	FIGURE_PATTERN,
	NOTE_MARK,
	EVENT_LABELS,
	WHAT_HEADING,
	WHO_HEADING,
	CONTACT_HEADING,
	NAV_LINKS,
	SITE_NAME,
	SITE_URL,
	SITE_DESCRIPTION,
	META_DIR,
	OG_FILE,
	WEBCLIP_FILE,
	OG_WIDTH,
	OG_HEIGHT,
	NAV_TITLE,
	LANGUAGE_LABEL,
	LANGUAGE_NAMES,
	SHUFFLE_LABEL,
	LIST_LABEL,
	IMAGE_LABEL,
	SORT_LABEL,
	SELECT_ONE,
	DOWNLOAD_LABEL,
	PREVIOUS_LABEL,
	NEXT_LABEL,
	COLUMNS,
	COLUMN_LABELS,
	MOBILE_COLUMNS,
	COPYRIGHT,
	CREDIT,
	CREDIT_URL,
	SIGNUP_TEXT,
	SIGNUP_LABEL,
	SIGNUP_ROWS,
	UPLOADS_DIR,
	IMAGES_DIR,
	MONTHS,
	LANGUAGES,
	SECTIONS,
	SHUFFLE_ICON,
	DOWNLOAD_ICON,
	slugify,
	escapeHtml,
	field,
	imageName,
	imageUrl,
	formatDate,
	hasTint,
	entryHref,
	coverImage,
	archiveData,
	escapeLines,
	wrapLines,
	paragraphs,
	lines,
	introParagraphs,
	sectionHeading,
	pageShell,
	aboutContent,
	today,
	eventDates,
	firstDate,
	lastDate,
	formatRange,
	eventLines,
	eventBlock,
	eventView,
	calendarDays,
	eventsContent,
	eventsExtras,
	aboutExtras,
	notesArticle,
	notesContent,
	formatDateCard,
	formatDateLong,
	articleSlug,
	romanNumeral,
	bodyFigures,
	inlineMarkdown,
	articleText,
	articleBody,
	articleCredits,
	articlePopup,
	notesExtras,
	indexLink,
	indexImage,
	indexContent,
	indexExtras,
	linkCodes,
	normaliseFiles,
	baseName,
	fileStem,
	setImageSource,
	prepareContent,
	renderPages
});

})(typeof module == 'object' && module.exports ? module.exports : (window.ArchivoRender = {}));
