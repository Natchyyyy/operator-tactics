# Crédits des sons d'OPERATOR TACTICS

Les sons du jeu sont soit **fabriqués par calcul** (`sons_ot.py` : musiques, interface, impacts au sol, grenade
incapacitante, rebond de grenade, rumeur de la ville et du port), soit **tirés de vrais enregistrements** sous licence libre
(`vrais.py`, sources brutes dans `sources/`), découpés, filtrés, mis au niveau et parfois mélangés à de la synthèse.

Les sons sous **CC BY** demandent de citer l'auteur : leur mention figure aussi dans le jeu (voir la fin de ce fichier).

## Free Firearm Sound Library — domaine public (CC0 1.0)
buddingmonkey / Still North Media — https://github.com/buddingmonkey/FreeFirearmsSFXLibrary
(via la boîte à outils, `sources/ffsl/` : tirs déjà découpés et normalisés)

| Son du jeu | Enregistrements |
|---|---|
| `tir_556_proche`, `tir_556_moyen`, `tir_556_loin` | carabine 5,56 type AR-15, micros près, à mi-distance et loin du tireur |
| `tir_silencieux` | même tir 5,56 (filtré) + bruit de culasse |
| `recharge` | chargeur et culasse de la carabine 5,56 |

## Explosions (via CDDA-Soundpacks)
| Son du jeu | Source | Auteur | Licence | Lien |
|---|---|---|---|---|
| `explosion` (variante 1) | explosion | j1987 | CC0 1.0 | https://freesound.org/people/j1987/sounds/140727/ |
| `explosion` (variantes 2 et 3) | explosion | **bmlake** | **CC BY 3.0** | https://freesound.org/people/bmlake/sounds/251617/ |
| `explosion_lourde` | explosion | unfa | CC0 1.0 | https://freesound.org/people/unfa/sounds/352143/ |

## CDDA-Soundpacks (CC-Sounds) — https://github.com/Fris0uman/CDDA-Soundpacks
| Son du jeu | Fichier source | Auteur | Licence | Lien |
|---|---|---|---|---|
| `impact_beton` | smash_fail_brick*.ogg | This_Is_A_Hoax | CC0 1.0 | https://freesound.org/people/This_Is_A_Hoax/sounds/354111/ |
| `impact_beton` | smash_fail_concrete*.ogg | oscaraudiogeek | CC0 1.0 | https://freesound.org/people/oscaraudiogeek/sounds/342888/ |
| `impact_beton`, `explosion` (gravillons) | walk_t_gravel_*.ogg | ali-6868 | CC0 1.0 | https://freesound.org/s/384871/ (série 384871–384880) |
| `impact_carrosserie` | hit_vehicle1–4.ogg | **Halleck** | **CC BY** | https://freesound.org/people/Halleck/sounds/121621/ |
| `impact_corps` | unarmed_hit_flesh_*.ogg | deleted_user_7146007 | CC0 1.0 | https://freesound.org/people/deleted_user_7146007/sounds/383882/ |
| `douilles` | brass_eject.ogg, brass_eject_1.ogg | **FST180081** | **CC BY 4.0** | https://freesound.org/people/FST180081/sounds/441806/ et /441809/ |
| `pas_mouille` (variante 1) | walk_t_water_sh_1.ogg | nathanaelj83 | CC0 1.0 | https://freesound.org/s/145242/ |
| `pas_mouille` (variantes 2–6) | walk_t_water_sh_2–6.ogg | **duckduckpony** | **CC BY** | https://freesound.org/s/204017/ (et 204032–204035) |
| `equipement` | clear_obstacle_2/3.ogg | MWsfx | CC0 1.0 | https://freesound.org/s/574247/ |
| `pluie`, `pluie_courte` | night_rain.ogg | **sergeeo** | **CC BY 3.0** | https://freesound.org/people/sergeeo/sounds/178636/ |
| `pas` | walk_t_rock_floor_1–4.ogg | samulis | CC0 1.0 | https://freesound.org/s/197778/ (série 197778–197781) |
| `vent`, `vent_court` | flurries.ogg | florianreichelt | CC0 1.0 | https://freesound.org/people/florianreichelt/sounds/453167/ |
| `oiseaux` | weather_sunny_spring.ogg | Modding | CC0 1.0 | https://freesound.org/people/Modding/sounds/574108/ |
| `nuit` | clear_night_3.ogg | rsn267 | CC0 1.0 | https://freesound.org/people/rgbrobot/sounds/209804/ (lien donné par le pack) |
| `sirene` | police_siren.ogg | conleec | CC0 1.0 | https://freesound.org/people/conleec/sounds/159743/ |
| `tonnerre` | thunder_far.ogg | chromakei | CC0 1.0 | https://freesound.org/people/chromakei/sounds/398287/ |

Gardés dans `sources/cdda/` pour le banc d'écoute (pas dans le jeu tant qu'ils n'ont pas été choisis) :
heavyrain.ogg (Ali@k, CC0), WEATHER_RAINSTORM.ogg (Iam_calderon, CC0), walk_t_concrete_*.ogg (InspectorJ, CC BY), clear_night_1.ogg (rsn267, CC0), cloudy_night.ogg (beambot, CC0),
WEATHER_SNOWSTORM.ogg (guyburns, CC0), smash_fail_glass_1.ogg (Sheyvan, CC0), small_bash_flesh_*.ogg (mateusboga, CC0),
reload default.ogg (magnuswaker, CC0).

## Kenney — Impact Sounds (CC0 1.0) — https://kenney.nl/assets/impact-sounds
`impact_metal` (impactMetal, impactPlate), `impact_verre` (impactGlass), `impact_bois` (impactWood), `impact_corps`
(impactPlate, une variante sur trois), `ricochet` (impactMetal_light + sifflement de synthèse), `chute` (impactSoft_heavy,
impactPunch_medium, impactMetal_light). Banc d'écoute : footstep_concrete.

## Synthèse
`claquement` (onde en N de la balle supersonique), `sifflement` (souffle avec effet Doppler) et le sifflement du `ricochet`
sont calculés ; les sons de `sons_ot.py` aussi (boîte à outils `dsp.py`).

## Mention à afficher dans le jeu (sons sous CC BY)
> Sons : Free Firearm Sound Library (CC0), Kenney (CC0), CDDA-Soundpacks et Freesound — bmlake (CC BY 3.0),
> Halleck (CC BY), FST180081 (CC BY 4.0), duckduckpony (CC BY), sergeeo (CC BY 3.0) ; autres sons CC0 (détails dans sons/CREDITS.md).
