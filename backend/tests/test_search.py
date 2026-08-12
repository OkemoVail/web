import pytest

import server

LITE_HTML = """
<html><body>
<table border="0" cellpadding="0" cellspacing="0">
  <tr><td valign="top">
    <a rel="nofollow" href="https://example.com/blue" class="result-link">Why Is the
       Sky Blue?</a>
  </td></tr>
  <tr><td class="result-snippet">Blue light scatters more than other colors.</td></tr>
  <tr><td class="result-url">example.com/blue</td></tr>
  <tr><td>&nbsp;</td></tr>
  <tr><td valign="top">
    <a rel="nofollow" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwiki.example%2FRayleigh" class="result-link">Rayleigh scattering</a>
  </td></tr>
  <tr><td class="result-snippet">Scattering of light by small particles.</td></tr>
  <tr><td class="result-url">wiki.example/Rayleigh</td></tr>
  <tr><td>&nbsp;</td></tr>
  <tr><td valign="top">
    <a rel="nofollow" href="//duckduckgo.com/y.js?ad_domain=ads.example" class="result-link">Sponsored junk</a>
  </td></tr>
  <tr><td class="result-snippet">Buy things now.</td></tr>
  <tr><td>&nbsp;</td></tr>
</table>
</body></html>
"""


def test_parse_ddg_lite_extracts_results():
    results = server.parse_ddg_lite(LITE_HTML)
    assert len(results) == 2
    assert results[0] == {
        "title": "Why Is the Sky Blue?",
        "url": "https://example.com/blue",
        "description": "Blue light scatters more than other colors.",
    }


def test_parse_ddg_lite_unwraps_uddg_redirects():
    results = server.parse_ddg_lite(LITE_HTML)
    assert results[1]["url"] == "https://wiki.example/Rayleigh"
    assert results[1]["title"] == "Rayleigh scattering"


def test_parse_ddg_lite_skips_ads_and_garbage():
    # the fixture's third row is an ad (y.js?ad_domain=…) — the count==2
    # assertion above covers it; here: garbage in, empty list out, no crash
    assert server.parse_ddg_lite("") == []
    assert server.parse_ddg_lite("<p>hello</p>") == []
    assert server.parse_ddg_lite(None) == []
