'use strict';
'require view';
'require form';
'require uci';
'require rpc';
'require ui';

var callStatus = rpc.declare({
	object: 'podkop-subscription',
	method: 'status'
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

function saveForm(map) {
	var names = [ 'url', 'target', 'mode', 'server', 'only_vless', 'restart', 'interval', 'user_agent' ];
	if (!uci.get('podkop-subscription', 'main'))
		uci.add('podkop-subscription', 'subscription', 'main');

	names.forEach(function(name) {
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
		var outBox = E('div', { 'id': 'pksub-out' });

		m = new form.Map('podkop-subscription', _('Подписка Podkop'),
			_('Скачивает подписку и записывает ссылки в выбранную секцию Podkop. Списки доменов и остальные правила секции не меняются. Тип секции становится Proxy. Ссылки с транспортом xhttp заработают, если установлен podkop-engine.'));

		s = m.section(form.NamedSection, 'main', 'subscription', _('Настройки'));
		s.anonymous = false;
		s.addremove = false;

		o = s.option(form.Value, 'url', _('Ссылка подписки'),
			_('Адрес вида https://…, по которому лежит список серверов.'));
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
			var url = optionValue(m, 'url').trim();
			if (!url)
				return _('Вставьте ссылку подписки');
			if (!/^https?:\/\/\S+$/i.test(url))
				return _('Нужна ссылка http:// или https:// без пробелов');
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

		var root = E('div');
		if (status.ok === false || status.podkop === false) {
			root.appendChild(E('div', {
				'style': 'margin:0 0 1em; padding:.7em .9em; border-radius:4px; background:rgba(180,40,40,.15);'
			}, _('Podkop не найден или страница открыта со старым входом в LuCI. Проверьте Podkop, выполните /etc/init.d/rpcd restart и зайдите в LuCI заново.')));
		}

		var self = this;
		return m.render().then(function(node) {
			root.appendChild(node);
			root.appendChild(actions);
			if (status.state)
				renderResult(Object.assign({ ok: true }, status.state));
			self.map = m;
			return root;
		});
	}
});
