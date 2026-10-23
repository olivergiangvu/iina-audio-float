#!/usr/bin/env python3
"""Chromium smoke test: live system theme, explicit overrides, persisted settings message, audio and visibility."""
from pathlib import Path
from playwright.sync_api import sync_playwright
p=Path(__file__).resolve().parent.parent/'ui/index.html'
with sync_playwright() as pl:
    browser=pl.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1150,'height':720},device_scale_factor=1)
    page.evaluate('''window._sent=[];window._handlers={};window.iina={
        postMessage:(name,data)=>{window._sent.push({name,data})},
        onMessage:(name,cb)=>{window._handlers[name]=cb}
    };''')
    page.emulate_media(color_scheme='light')
    page.set_content(p.read_text());page.wait_for_timeout(100)
    get=lambda s:page.evaluate(s)
    assert get('document.documentElement.dataset.theme')=='system'
    assert '250, 251, 253' in get('getComputedStyle(document.querySelector("#popover")).backgroundColor'),get('getComputedStyle(document.querySelector("#popover")).backgroundColor')
    page.emulate_media(color_scheme='dark');page.wait_for_timeout(100)
    assert '38, 36, 43' in get('getComputedStyle(document.querySelector("#popover")).backgroundColor')
    page.locator('#audio-button').click()
    assert page.locator('#popover').evaluate('(e)=>e.classList.contains("open")')
    assert page.locator('[data-theme-option="system"]').get_attribute('aria-pressed')=='true'
    page.locator('[data-theme-option="light"]').click()
    assert get('document.documentElement.dataset.theme')=='light'
    assert '250, 251, 253' in get('getComputedStyle(document.querySelector("#popover")).backgroundColor')
    assert page.locator('[data-theme-option="light"]').get_attribute('aria-pressed')=='true'
    assert get('window._sent.some(x=>x.name==="af-theme-change"&&x.data.mode==="light")')
    page.emulate_media(color_scheme='light');page.emulate_media(color_scheme='dark');page.wait_for_timeout(60)
    assert '250, 251, 253' in get('getComputedStyle(document.querySelector("#popover")).backgroundColor')
    page.locator('[data-theme-option="dark"]').click()
    assert '38, 36, 43' in get('getComputedStyle(document.querySelector("#popover")).backgroundColor')
    assert page.locator('[data-theme-option="dark"]').get_attribute('aria-pressed')=='true'
    # Persistence round-trip emulated from plugin after restart / af-ready.
    page.evaluate('window._handlers["af-theme-config"]({mode:"system"})')
    assert page.locator('[data-theme-option="system"]').get_attribute('aria-pressed')=='true'
    assert '38, 36, 43' in get('getComputedStyle(document.querySelector("#popover")).backgroundColor')
    page.emulate_media(color_scheme='light');page.wait_for_timeout(60)
    assert '250, 251, 253' in get('getComputedStyle(document.querySelector("#popover")).backgroundColor')
    # Test audio bridge preserved for selection.
    page.evaluate('window._handlers["af-tracks"]({ready:true,tracks:[{id:1,title:"French",selected:true},{id:2,title:"English",selected:false}]})')
    assert page.locator('.track').count()==2
    page.locator('.track').nth(1).click()
    assert get('window._sent.some(x=>x.name==="af-set-track" && x.data.id===2)')
    page.evaluate('window._handlers["af-switch-status"]({state:"ok",id:2})')
    assert 'confirmed' in page.locator('#switch-status').inner_text()
    # Visibility bridge still works (we do not alter state machine).
    page.locator('#audio-button').click()
    page.evaluate('window._handlers["af-visibility"]({visible:false})')
    assert 'hidden' in page.locator('#anchor').get_attribute('class')
    print('PASS: theme System live Light/Dark, Light/Dark overrides, UI persistence message, audio selection, visibility')
    page.evaluate('window._handlers["af-visibility"]({visible:true})')
    page.locator('#audio-button').click()
    page.locator('[data-theme-option="light"]').click()
    page.screenshot(path='/mnt/data/Audio-Float-v1.1.0-RC-Light-preview.png')
    page.locator('[data-theme-option="dark"]').click()
    page.screenshot(path='/mnt/data/Audio-Float-v1.1.0-RC-Dark-preview.png')
    browser.close()
