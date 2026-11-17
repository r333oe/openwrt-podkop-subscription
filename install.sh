#!/bin/sh
# One-file installer. On the router:
# wget -O /tmp/podkop-subscription-install.sh https://raw.githubusercontent.com/r333oe/openwrt-podkop-subscription/main/install.sh
# sh /tmp/podkop-subscription-install.sh
set -eu

RAW="https://raw.githubusercontent.com/r333oe/openwrt-podkop-subscription/main/luci-app-podkop-subscription"
HERE=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
SRC=""

if [ -f "$HERE/luci-app-podkop-subscription/root/usr/bin/podkop-subscription" ]; then
	SRC="$HERE/luci-app-podkop-subscription"
elif [ -f "$HERE/root/usr/bin/podkop-subscription" ]; then
	SRC="$HERE"
fi

if [ "$(id -u)" -ne 0 ]; then
	echo "Запустите от root" >&2
	exit 1
fi

if [ ! -x /etc/init.d/podkop ] && [ ! -x /usr/bin/podkop ]; then
	echo "Podkop не установлен. Сначала поставьте его, затем повторите эту команду." >&2
	exit 1
fi

if ! command -v curl >/dev/null 2>&1 || ! command -v jq >/dev/null 2>&1 || ! command -v base64 >/dev/null 2>&1; then
	echo "Нужны curl, jq и base64. Они ставятся вместе с Podkop." >&2
	exit 1
fi

if ! command -v wget >/dev/null 2>&1; then
	echo "Нужен wget" >&2
	exit 1
fi

install_one() {
	rel=$1
	dest=$2
	mode=$3
	mkdir -p "$(dirname "$dest")"
	if [ -n "$SRC" ] && [ -f "$SRC/$rel" ]; then
		cp "$SRC/$rel" "$dest"
	else
		echo "Скачиваю $rel"
		wget -O "$dest" "$RAW/$rel" || {
			echo "Не удалось скачать $rel" >&2
			exit 1
		}
	fi
	if [ ! -s "$dest" ]; then
		echo "Пустой файл: $rel" >&2
		exit 1
	fi
	chmod "$mode" "$dest"
}

install_one root/usr/bin/podkop-subscription /usr/bin/podkop-subscription 755
install_one root/usr/libexec/rpcd/podkop-subscription /usr/libexec/rpcd/podkop-subscription 755
install_one root/etc/init.d/podkop-subscription /etc/init.d/podkop-subscription 755
install_one root/usr/share/luci/menu.d/luci-app-podkop-subscription.json /usr/share/luci/menu.d/luci-app-podkop-subscription.json 644
install_one root/usr/share/rpcd/acl.d/luci-app-podkop-subscription.json /usr/share/rpcd/acl.d/luci-app-podkop-subscription.json 644
install_one htdocs/luci-static/resources/view/podkop-subscription/subscribe.js /www/luci-static/resources/view/podkop-subscription/subscribe.js 644

if [ ! -f /etc/config/podkop-subscription ]; then
	install_one root/etc/config/podkop-subscription /etc/config/podkop-subscription 644
fi

mkdir -p /etc/podkop-subscription
chmod 700 /etc/podkop-subscription

/etc/init.d/podkop-subscription enable
/etc/init.d/podkop-subscription start
/etc/init.d/rpcd restart >/dev/null 2>&1 || true
rm -f /tmp/luci-indexcache /tmp/luci-modulecache/* 2>/dev/null || true

echo ""
echo "Установлено."
echo "LuCI: Services -> Подписка Podkop"
echo "Выйдите из LuCI, зайдите снова и обновите страницу через Ctrl+F5."
echo ""
