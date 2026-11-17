'use strict';
/* podkop-subscription interface v12 */
'require view';
'require form';
'require uci';
'require rpc';
'require ui';

var callStatus = rpc.declare({
	object: 'podkop-subscription',
	method: 'status'
});

var callTraffic = rpc.declare({
	object: 'podkop-subscription',
	method: 'traffic'
});

var callPreview = rpc.declare({
	object: 'podkop-subscription',
	method: 'preview'
});

var callApply = rpc.declare({
	object: 'podkop-subscription',
	method: 'apply',
	params: [ 'server' ]
});

function optionValue(map, name) {
	var opts = map.lookupOption(name, 'main');
	if (!opts || !opts[0])
		return '';
	var value = opts[0].formvalue('main');
	return (value == null) ? '' : String(value);
}

function subscriptionUrls(map) {
	var opts = map.lookupOption('url', 'main');
	if (!opts || !opts[0])
		return [];
	var value = opts[0].formvalue('main');
	var list = [];
	if (Array.isArray(value))
		list = value;
	if (typeof value === 'string')
		list = value.split(/[\s,]+/);
	var urls = [];
	list.forEach(function(item) {
		item = String(item || '').trim();
		if (item)
			urls.push(item);
	});
	return urls;
}

function saveForm(map) {
	var names = [ 'url', 'target', 'mode', 'server', 'only_vless', 'ignore_ru', 'ignore_auto', 'restart', 'interval', 'user_agent', 'hwid' ];
	if (!uci.get('podkop-subscription', 'main'))
		uci.add('podkop-subscription', 'subscription', 'main');

	names.forEach(function(name) {
		if (name === 'url') {
			uci.set('podkop-subscription', 'main', 'url', subscriptionUrls(map));
			return;
		}
		var value = optionValue(map, name);
		if (name === 'server') {
			var pick = document.getElementById('pksub-pick');
			if (pick)
				value = pick.value;
		}
		uci.set('podkop-subscription', 'main', name, value);
	});
	return uci.save();
}

function formatBytes(n) {
	var units = [ 'КБ', 'МБ', 'ГБ', 'ТБ' ];
	var digits, i;
	n = Number(n);
	if (!isFinite(n) || n < 0)
		n = 0;
	if (n < 1024)
		return Math.round(n) + ' Б';
	i = -1;
	do {
		n /= 1024;
		i++;
	} while (n >= 1024 && i < units.length - 1);
	digits = n >= 100 ? 0 : 1;
	return n.toFixed(digits).replace(/\.0$/, '') + ' ' + units[i];
}

function monthLabel(ym) {
	var names = [
		'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
		'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'
	];
	var parts = String(ym || '').split('-');
	var month = Number(parts[1]);
	var name;
	if (!month || month < 1 || month > 12)
		return ym || '';
	name = names[month - 1];
	return name.charAt(0).toUpperCase() + name.slice(1) + ' ' + parts[0];
}

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('podkop-subscription'),
			callStatus().catch(function() {
				return { ok: false, podkop: false, sections: [], state: null };
			})
		]);
	},

	render: function(data) {
		var status = data[1] || {};
		var sections = (status.sections && status.sections.length) ? status.sections : [ 'main' ];
		var m, s, o;
		var view = this;
		var outBox = E('div', { 'id': 'pksub-out' });
		var trafficBox = E('div', { 'id': 'pksub-traffic' });

		m = new form.Map('podkop-subscription', _('Подписка Podkop'),
			_('Скачивает подписку и записывает ссылки в выбранную секцию Podkop. Списки доменов и остальные правила секции не меняются. Тип секции становится Proxy. Ссылки с транспортом xhttp заработают, если установлен podkop-engine.'));

		s = m.section(form.NamedSection, 'main', 'subscription', _('Настройки'));
		s.anonymous = false;
		s.addremove = false;

		o = s.option(form.DynamicList, 'url', _('Ссылки подписок'),
			_('Можно добавить несколько. Серверы из всех ссылок собираются в один список.'));
		o.placeholder = 'https://';
		o.rmempty = false;
		o.validate = function(section_id, value) {
			if (!value)
				return true;
			if (!/^https?:\/\/\S+$/i.test(value))
				return _('Нужна ссылка http:// или https:// без пробелов');
			return true;
		};

		o = s.option(form.ListValue, 'target', _('Секция Podkop'));
		sections.forEach(function(name) {
			o.value(name, name);
		});
		o.default = 'main';

		o = s.option(form.ListValue, 'mode', _('Куда записать'),
			_('URLTest сам выбирает сервер по задержке. Selector оставляет выбор вам. Одна ссылка пишет только выбранный сервер.'));
		o.value('urltest', _('URLTest — все серверы, автовыбор'));
		o.value('selector', _('Selector — все серверы, ручной выбор'));
		o.value('url', _('Одна ссылка'));
		o.default = 'urltest';

		o = s.option(form.Value, 'server', _('Номер сервера'),
			_('Для режима «Одна ссылка». 0 — первый сервер в подписке. После «Показать серверы» номер можно выбрать в списке.'));
		o.default = '0';
		o.datatype = 'uinteger';
		o.depends('mode', 'url');

		o = s.option(form.Flag, 'only_vless', _('Только VLESS'),
			_('Если снять, дополнительно записываются Shadowsocks, Trojan, Hysteria2 и SOCKS.'));
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.Flag, 'ignore_ru', _('Игнорировать RU серверы'),
			_('Не записывать серверы с флагом 🇷🇺 или со словом «Россия» в имени.'));
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.Flag, 'ignore_auto', _('Игнорировать «Авто»'),
			_('Не записывать серверы, в имени которых есть «Авто».'));
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.Flag, 'restart', _('Перезапускать Podkop'),
			_('После записи ссылок перезапустить службу, чтобы она их подхватила.'));
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.ListValue, 'interval', _('Автообновление'),
			_('По расписанию подписка скачивается снова и ссылки в секции заменяются. Расписание применяется вместе с сохранением страницы.'));
		o.value('0', _('Выключено'));
		o.value('6h', _('Каждые 6 часов'));
		o.value('12h', _('Каждые 12 часов'));
		o.value('24h', _('Раз в сутки'));
		o.default = '0';

		o = s.option(form.Value, 'user_agent', _('User-Agent'),
			_('Многие сервисы отдают список vless:// только клиенту v2rayNG. Для Clash-подписки оставьте v2rayNG/1.8.29.'));
		o.placeholder = 'v2rayNG/1.8.29';
		o.default = 'v2rayNG/1.8.29';
		o.rmempty = false;

		o = s.option(form.Value, 'hwid', _('HWID'),
			_('Код устройства, который панель подписки ждёт в заголовке x-hwid. Пустое поле — роутер сам создаст постоянный код из MAC-адреса.'));
		o.placeholder = _('создать автоматически');
		o.rmempty = true;
		o.optional = true;

		function clearBox() {
			while (outBox.firstChild)
				outBox.removeChild(outBox.firstChild);
		}

		function showText(text, kind) {
			var color = (kind === 'error') ? 'rgba(180,40,40,.15)' :
				(kind === 'warn') ? 'rgba(180,120,0,.18)' : 'rgba(0,128,0,.15)';
			outBox.appendChild(E('div', {
				'style': 'margin:1em 0; padding:.7em .9em; border-radius:4px; background:' + color
			}, text || ''));
		}

		function renderResult(res) {
			clearBox();
			if (!res || res.ok === false) {
				showText((res && res.error) || _('Не удалось выполнить запрос'), 'error');
				return;
			}
			if (res.message)
				showText(res.message, 'ok');
			if (res.warning)
				showText(res.warning, 'warn');
			if (res.time)
				showText(_('Последняя запись: ') + res.time, 'ok');

			var servers = res.servers || [];
			if (!servers.length)
				return;

			if (optionValue(m, 'mode') === 'url') {
				var pick = E('select', {
					'id': 'pksub-pick',
					'style': 'margin:.4em 0 1em; max-width:42em;'
				});
				servers.forEach(function(srv) {
					var label = (srv.index + 1) + '. ' + (srv.name || srv.host || srv.scheme);
					pick.appendChild(E('option', { 'value': String(srv.index) }, label));
				});
				var saved = optionValue(m, 'server') || '0';
				pick.value = saved;
				outBox.appendChild(E('div', {}, [
					E('strong', {}, _('Сервер для режима одной ссылки')),
					E('div', {}, pick)
				]));
			}

			var rows = [
				E('tr', { 'class': 'tr table-titles' }, [
					E('th', { 'class': 'th' }, '#'),
					E('th', { 'class': 'th' }, _('Имя')),
					E('th', { 'class': 'th' }, _('Тип')),
					E('th', { 'class': 'th' }, _('Адрес'))
				])
			];
			servers.forEach(function(srv) {
				rows.push(E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td left' }, String(srv.index + 1)),
					E('td', { 'class': 'td left' }, srv.name || ''),
					E('td', { 'class': 'td left' }, srv.scheme || ''),
					E('td', { 'class': 'td left' }, srv.host || '')
				]));
			});
			outBox.appendChild(E('div', {
				'style': 'max-height:28em; overflow:auto; margin-top:.5em;'
			}, [
				E('table', { 'class': 'table' }, rows)
			]));
		}

		function validateUrl() {
			var urls = subscriptionUrls(m);
			var i;
			if (!urls.length)
				return _('Вставьте ссылку подписки');
			for (i = 0; i < urls.length; i++) {
				if (!/^https?:\/\/\S+$/i.test(urls[i]))
					return _('Нужна ссылка http:// или https:// без пробелов');
			}
			return null;
		}

		function runAction(fn) {
			var problem = validateUrl();
			if (problem) {
				renderResult({ ok: false, error: problem });
				return Promise.resolve();
			}
			return saveForm(m).then(fn).then(function(res) {
				renderResult(res || { ok: false, error: _('Пустой ответ') });
			}).catch(function() {
				renderResult({
					ok: false,
					error: _('Сервис на роутере не ответил. Выполните /etc/init.d/rpcd restart и обновите страницу.')
				});
			});
		}

		var actions = E('div', { 'class': 'cbi-section' }, [
			E('div', { 'class': 'cbi-section-node' }, [
				E('div', { 'style': 'display:flex; gap:.6em; flex-wrap:wrap;' }, [
					E('button', {
						'class': 'btn cbi-button cbi-button-action',
						'click': ui.createHandlerFn(this, function() {
							return runAction(function() {
								return callPreview();
							});
						})
					}, _('Показать серверы')),
					E('button', {
						'class': 'btn cbi-button cbi-button-apply',
						'click': ui.createHandlerFn(this, function() {
							return runAction(function() {
								var pick = document.getElementById('pksub-pick');
								var server = pick ? pick.value : (optionValue(m, 'server') || '0');
								return callApply(server || '0');
							});
						})
					}, _('Записать в Podkop'))
				]),
				outBox
			])
		]);

		function noteBox(text, kind) {
			var color = (kind === 'error') ? 'rgba(180,40,40,.15)' : 'rgba(180,120,0,.18)';
			return E('div', {
				'style': 'margin:.7em 0 0; padding:.7em .9em; border-radius:4px; background:' + color
			}, text);
		}

		function statCard(title, obj) {
			var up = Number(obj && obj.up) || 0;
			var down = Number(obj && obj.down) || 0;
			var total = Number(obj && obj.total);
			if (!isFinite(total))
				total = up + down;
			return E('div', {
				'style': 'flex:1 1 16em; padding:.85em 1em; border-radius:4px; background:rgba(0,0,0,.06);'
			}, [
				E('div', {}, title),
				E('div', {
					'style': 'font-size:1.35em; font-weight:600; line-height:1.2; margin-top:.2em;'
				}, formatBytes(total)),
				E('div', { 'style': 'margin-top:.35em;' }, '↑ ' + formatBytes(up) + '   ↓ ' + formatBytes(down))
			]);
		}

		function paintTraffic(tr) {
			var body = [];
			var meta = [];
			var previous;
			while (trafficBox.firstChild)
				trafficBox.removeChild(trafficBox.firstChild);
			if (!tr || tr.ok === false) {
				body.push(noteBox((tr && tr.error) || _('Служба не вернула статистику. Выполните /etc/init.d/rpcd restart и обновите страницу.'), 'error'));
			} else {
				if (tr.month)
					body.push(E('div', { 'style': 'font-weight:600; margin-bottom:.5em;' }, monthLabel(tr.month)));
				body.push(E('div', { 'style': 'display:flex; gap:.8em; flex-wrap:wrap;' }, [
					statCard(_('Через VPN'), tr.vpn || {}),
					statCard(_('Напрямую'), tr.direct || {})
				]));
				body.push(E('div', { 'style': 'margin-top:.45em; opacity:.8;' }, _('↑ исходящий, ↓ входящий')));
				if (tr.empty)
					body.push(noteBox(_('Счётчик ещё не записан. Нажмите «Обновить статистику» через несколько секунд.'), 'warn'));
				if (tr.vpn_available === false)
					body.push(noteBox(_('Podkop сейчас не ответил, поэтому трафик через VPN за последние минуты ещё не добавлен. Уже сохранённая сумма на месте.'), 'warn'));
				if (tr.direct_available === false)
					body.push(noteBox(_('Счётчик прямого трафика не включился. Для него нужен nftables, он ставится вместе с Podkop.'), 'warn'));
				if (tr.flow_offload)
					body.push(noteBox(_('Включён flow offload. Прямой трафик может быть меньше реального: часть пакетов ядро проводит мимо счётчика.'), 'warn'));
				previous = tr.previous;
				if (previous && previous.month) {
					body.push(E('div', { 'style': 'margin-top:.7em;' },
						_('Прошлый месяц') + ', ' + monthLabel(previous.month) + ': ' +
						_('через VPN') + ' ' + formatBytes((previous.vpn || {}).total) + ', ' +
						_('напрямую') + ' ' + formatBytes((previous.direct || {}).total) + '.'));
				}
				if (tr.since)
					meta.push(_('Учёт с ') + tr.since);
				if (tr.updated)
					meta.push(_('обновлено ') + tr.updated);
				if (meta.length)
					body.push(E('div', { 'style': 'margin-top:.6em; opacity:.8;' }, meta.join('. ') + '.'));
			}
			body.push(E('div', { 'style': 'margin-top:.7em;' }, E('button', {
				'class': 'btn cbi-button cbi-button-action',
				'type': 'button',
				'click': ui.createHandlerFn(view, function() {
					return callTraffic().then(function(res) {
						paintTraffic(res);
					}).catch(function() {
						paintTraffic({
							ok: false,
							error: _('Сервис на роутере не ответил. Выполните /etc/init.d/rpcd restart и обновите страницу.')
						});
					});
				})
			}, _('Обновить статистику'))));
			trafficBox.appendChild(E('div', { 'class': 'cbi-section', 'id': 'pksub-traffic-section' }, [
				E('h3', {}, _('Трафик за месяц')),
				E('div', { 'class': 'cbi-section-descr' },
					_('Через VPN — трафик, который Podkop отправил в прокси. Напрямую — трафик, который ушёл в интернет мимо Podkop. Сумма за календарный месяц хранится на роутере и не сбрасывается при перезапуске Podkop.')),
				E('div', { 'class': 'cbi-section-node' }, body)
			]));
		}

		var root = E('div');
		if (status.ok === false || status.podkop === false) {
			root.appendChild(E('div', {
				'style': 'margin:0 0 1em; padding:.7em .9em; border-radius:4px; background:rgba(180,40,40,.15);'
			}, _('Podkop не найден или страница открыта со старым входом в LuCI. Проверьте Podkop, выполните /etc/init.d/rpcd restart и зайдите в LuCI заново.')));
		}

		if (status.hwid) {
			root.appendChild(E('div', {
				'style': 'margin:0 0 1em; padding:.7em .9em; border-radius:4px; background:rgba(0,0,0,.06);'
			}, _('С подпиской отправляется HWID: ') + status.hwid));
		}

		paintTraffic(status.traffic);

		var self = this;
		return m.render().then(function(node) {
			var anchor = (node && node.querySelector) ? node.querySelector('.cbi-section') : null;
			if (anchor && anchor.parentNode)
				anchor.parentNode.insertBefore(trafficBox, anchor);
			else if (node && node.appendChild)
				node.appendChild(trafficBox);
			else
				root.appendChild(trafficBox);
			root.appendChild(node);
			root.appendChild(actions);
			if (status.state)
				renderResult(Object.assign({ ok: true }, status.state));
			self.map = m;
			return root;
		});
	}
});
