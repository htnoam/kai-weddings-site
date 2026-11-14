#!/bin/sh
# Cloudflare Pages build: the same _redirects as Netlify, minus Netlify-only syntax.
# "200!"/"301!" (Netlify's "force") → "200"/"301" (Cloudflare always applies _redirects first), and ".html" targets → clean URLs.
sed -i -E 's/(200|301)!([[:space:]]*)$/\1\2/; s#\.html([[:space:]]+200)#\1#' _redirects
