# Audit a optimalizace WebGL

Datum: 2026-11-11

## Stav před změnou

- Aplikace zobrazovala vždy jen jednu scénu a GLB se načítal přes cache `useLoader`; všech 11 GLB se při prvním otevření nestahovalo.
- `key={scene.id}` na `WatchExperience` ale při každém přepnutí zahodil celý Canvas a vytvořil nový WebGL renderer.
- Canvas běžel i ve skryté záložce a neměl vazbu na viditelnost ve viewportu.
- Produkce měla jednu R3F renderovací smyčku; druhý explicitní `requestAnimationFrame` existoval pouze v QA HUDu aktivovaném parametrem `?debug=1`.
- Cleanup klonu volal `dispose()` také nad geometriemi a texturami sdílenými s cache zdrojového GLB. To mohlo poškodit následující scénu nebo znovu použitý asset.
- Rust scéna držela po odchodu v cache 393 souborů o velikosti 76.15 MiB.
- Celkem mají GLB soubory 1015.63 MiB. Žádný nepoužívá Meshopt ani KTX2.

## Implementované změny

- Canvas nemá klíč podle scény: jeden renderer a jedna řízená smyčka zůstávají po celou návštěvu.
- Aktivní je pouze aktuální model. Další asset se přednačte jen při hoveru/focusu navigace nebo během potvrzeného přechodu.
- HTTP prefetch je deduplikovaný pomocí množiny URL; parser GLTF používá cache `useLoader`.
- `IntersectionObserver` a Page Visibility API přepnou frameloop na `never`, když je plocha mimo viewport nebo záložka není viditelná.
- `prefers-reduced-motion: reduce` zastaví automatické animace a pohyb světel/modelu.
- Mobilní DPR je omezen na 1 a existující mobilní snížení počtu částic zůstalo zachováno.
- Klony uvolňují jen vlastní materiály. Sdílené zdrojové geometrie, materiály a textury jsou reference-counted a uvolní se 30 sekund po posledním použití; rychlý návrat cleanup zruší.
- Stejnou 30sekundovou ochranu a následný cleanup má 393 rust textur.
- Build automaticky spouští `npm run assets:audit` a vytváří `reports/model-assets.json`. Nový GLB se tak objeví ve velikostním a kompresním reportu při každém buildu.
- Odstraněn byl neplatný preload na neexistující `watch_fragments.glb`.

## Měření

QA proběhla nad produkčními buildy ve stejném in-app Chromium prostředí, scéna Přítomnost, po zahřátí:

| Metrika | Před | Po |
|---|---:|---:|
| Přenos první scény Přítomnost | 14.83 MB | 14.83 MB |
| Medián FPS | 120.5 | 120.5 |
| p95 frame time | 9.3 ms | 8.7 ms |
| framy nad 100 ms | 0 | 0 |
| WebGL renderer během přepnutí | nový pro každou scénu | jeden sdílený |
| render ve skryté záložce / mimo viewport | ano | ne |

Přenos se nezmenšil, protože GLB nebyly destruktivně změněny. Přínos této etapy je v lazy-loadingu, stabilním rendereru a omezené životnosti GPU/CPU prostředků. Při přepnutí Přítomnost → Minulost byl celkový přenos 136.53 MB, tedy odpovídající jedinému novému GLB bez druhého stažení.

## Zbývající assetový dluh

Nejvyšší prioritu mají `watch_future.glb`, `watch_inflate.glb`, `watch_squash.glb`, `watch_echo.glb` a `watch_speed.glb`. Je nutné udělat nedestruktivní exportní kopie v Blenderu, snížit počet/rozlišení vložených obrazů, odstranit nepoužité datablocky a následně použít Meshopt + KTX2. Rust masky je vhodné převést na atlas nebo shaderovou masku; 360 samostatných PNG není webově efektivní.

Zdrojové GLB zůstaly beze změny.
