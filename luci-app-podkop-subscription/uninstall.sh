#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
	echo "Запустите от root" >&2
	exit 1
fi

if [ -x /etc/init.d/podkop-subscription ]; then
	/etc/init.d/podkop-subscription disable >/dev/null 2>&1 || true
	/etc/init.d/podkop-subscription stop >/dev/null 2>&1 || true
fi

if [ -f /etc/crontabs/root ]; then
	sed -i '/# podkop-subscription begin/,/# podkop-subscription end/d' /etc/crontabs/root || true
	sed -i '\#/usr/bin/podkop-subscription apply#d' /etc/crontabs/root || true
	sed -i '/# podkop-subscription-traffic begin/,/# podkop-subscription-traffic end/d' /etc/crontabs/root || true
	sed -i '\#/usr/bin/podkop-subscription traffic-sample#d' /etc/crontabs/root || true
	/etc/init.d/cron reload >/dev/null 2>&1 || true
fi

if command -v nft >/dev/null 2>&1; then
	nft delete table inet PodkopSubAcct >/dev/null 2>&1 || true
fi

rm -f \
	/usr/bin/podkop-subscription \
	/usr/libexec/rpcd/podkop-subscription \
	/etc/init.d/podkop-subscription \
	/usr/share/luci/menu.d/luci-app-podkop-subscription.json \
	/usr/share/rpcd/acl.d/luci-app-podkop-subscription.json \
	/www/luci-static/resources/view/podkop-subscription/subscribe.js

rm -rf /etc/podkop-subscription
rmdir /www/luci-static/resources/view/podkop-subscription 2>/dev/null || true

/etc/init.d/rpcd restart >/dev/null 2>&1 || true
rm -f /tmp/luci-indexcache 2>/dev/null || true

echo "Дополнение удалено."
echo "Ссылки, уже записанные в /etc/config/podkop, оставлены."
echo "Файл настроек /etc/config/podkop-subscription тоже оставлен."
