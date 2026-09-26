/*
 * Badge icon set.
 *
 * Discord does not publish profile badge artwork under stable, name-based
 * URLs: the current CDN is keyed by an internal hash that rotates, and the
 * older numeric endpoints now return 403. Rather than hot-link art that
 * breaks without warning, each badge gets an original glyph drawn here.
 * These are representative icons, not Discord's official badge images.
 *
 * Loaded by both the admin console and the summary dashboard so the two
 * stay in sync. Exposes window.BadgeIcons.
 */
(function (global) {
  'use strict';

  // Real Discord badge artwork already shipped in the repo, under
  // assets/images/badges. Referencing these files means the images are served
  // from our own domain: they cannot break when Discord rotates its CDN, and
  // they cannot be blocked by an ad blocker or a third-party outage.
  //
  // Badges with no matching file fall back to the inline glyph above, so a
  // missing asset degrades to a drawn icon rather than an empty space.
  var ASSET_BASE = '/assets/images/badges/';
  var ASSETS = {
    // Server boost levels
    'Boost Level 1': 'boost_badges/discordboost1.svg',
    'Boost Level 2': 'boost_badges/discordboost2.svg',
    'Boost Level 3': 'boost_badges/discordboost3.svg',
    'Boost Level 4': 'boost_badges/discordboost4.svg',
    'Boost Level 5': 'boost_badges/discordboost5.svg',
    'Boost Level 6': 'boost_badges/discordboost6.svg',
    'Boost Level 7': 'boost_badges/discordboost7.svg',
    'Boost Level 8': 'boost_badges/discordboost8.svg',
    'Boost Level 9': 'boost_badges/discordboost9.svg',

    // Nitro
    'Nitro': 'discordnitro.svg',
    'Bronze': 'nitro_badges/bronze.png',
    'Silver': 'nitro_badges/silver.png',
    'Gold': 'nitro_badges/gold.png',
    'Platinum': 'nitro_badges/platinum.png',
    'Emerald': 'nitro_badges/emerald.png',
    'Ruby': 'nitro_badges/ruby.png',
    'Opal': 'nitro_badges/opal.png',
    'Diamond': 'nitro_badges/diamond.png',

    // People and programmes
    'Discord Staff': 'discordstaff.svg',
    'Partner': 'discordpartner.svg',
    'Early Supporter': 'discordearlysupporter.svg',
    'HypeSquad Events': 'hypesquadevents.svg',
    'HypeSquad Bravery': 'hypesquadbravery.svg',
    'HypeSquad Brilliance': 'hypesquadbrilliance.svg',
    'HypeSquad Balance': 'hypesquadbalance.svg',

    // Bugs and moderation
    'Bug Hunter Level 1': 'discordbughunter1.svg',
    'Bug Hunter Level 2': 'discordbughunter2.svg',
    'Discord Certified Moderator': 'discordmod.svg',
    'Active Developer': 'activedeveloper.svg',

    // Gift tiers, same levels and artwork the main profile tool awards
    'Patron': 'gift_badges/giftlvl1.png',
    'Champion': 'gift_badges/giftlvl2.png',
    'Luminary': 'gift_badges/giftlvl3.png',
    'Icon': 'gift_badges/giftlvl4.png',
    'Hero': 'gift_badges/giftlvl5.png',
    'Legend': 'gift_badges/giftlvl6.png'
  };

  // The asset for a badge, or '' when there is none and the glyph is used.
  function asset(label) {
    var key = resolve(label);
    if (!key || !ASSETS[key]) return '';
    return ASSET_BASE + ASSETS[key];
  }

  // viewBox 0 0 24 24, stroked with currentColor so icons inherit colour.
  var GLYPHS = {
    // Nitro
    'Nitro': '<path d="M12 2.6l2.6 5.5 6 .9-4.3 4.2 1 6-5.3-2.8-5.3 2.8 1-6L3.4 9l6-.9z"/>',
    'Nitro Basic': '<path d="M12 2.6l2.6 5.5 6 .9-4.3 4.2 1 6-5.3-2.8-5.3 2.8 1-6L3.4 9l6-.9z"/><path d="M9.6 13.4h4.8"/>',
    'Nitro Classic': '<path d="M12 2.6l2.6 5.5 6 .9-4.3 4.2 1 6-5.3-2.8-5.3 2.8 1-6L3.4 9l6-.9z"/><path d="M8.4 11.2h7.2M8.4 14h4.4"/>',

    // Nitro material tiers, matching the artwork in nitro_badges/. Drawn as an
    // ingot for the metals and a cut gem for the stones, so the fallback still
    // tells the two families apart.
    'Bronze': '<path d="M6.6 9.4h10.8l2.2 8.2H4.4z"/><path d="M6.6 9.4L9 5.6h6l2.4 3.8"/>',
    'Silver': '<path d="M5.8 10.2h12.4l-2 7.4H7.8z"/><path d="M5.8 10.2L8.6 6h6.8l2.8 4.2M8.6 13.4h6.8"/>',
    'Gold': '<path d="M5 11h14l-1.6 6.6H6.6z"/><path d="M5 11l3-4.4h8L19 11"/><path d="M9.4 14.2h5.2"/>',
    'Platinum': '<path d="M4.4 12.2L12 5.4l7.6 6.8L12 19z"/><path d="M4.4 12.2h15.2M12 5.4v13.6"/>',
    'Emerald': '<path d="M7.4 6.6h9.2l3.8 5.6-8.4 6.6-8.4-6.6z"/><path d="M3.6 12.2h16.8M7.4 6.6l4.6 5.6 4.6-5.6M12 12.2v6.6"/>',
    'Ruby': '<path d="M7 6.4h10l3.6 5.8L12 19 3.4 12.2z"/><path d="M3.4 12.2h17.2M7 6.4l5 5.8 5-5.8"/>',
    'Opal': '<path d="M12 3.4c4.8 3.4 7.2 6.6 7.2 9.4A7.2 7.2 0 014.8 12.8c0-2.8 2.4-6 7.2-9.4z"/><path d="M8.6 13.4a3.4 3.4 0 006.8 0"/>',
    'Diamond': '<path d="M7.6 5.4h8.8l3.4 6.8L12 20.6 4.2 12.2z"/><path d="M4.2 12.2h15.6M7.6 5.4L12 12.2l4.4-6.8M12 12.2v8.4"/>',

    // Server boost tiers: a rising bolt, tier shown as a count.
    'Boost Level 0': '<path d="M13 2.5L5.5 13.2h5l-1.5 8.3L18.5 10.6h-5.2z"/>',
    'Boost Level 1': '<path d="M13 2.5L5.5 13.2h5l-1.5 8.3L18.5 10.6h-5.2z"/><path d="M19.5 4.2l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
    'Boost Level 2': '<path d="M13 2.5L5.5 13.2h5l-1.5 8.3L18.5 10.6h-5.2z"/><path d="M19.5 2.6l.6 1.5 1.5.6-1.5.6-.6 1.5-.6-1.5-1.5-.6 1.5-.6zM22.4 7.6l.4 1 1 .4-1 .4-.4 1-.4-1-1-.4 1-.4z"/>',
    'Boost Level 3': '<path d="M13 2.5L5.5 13.2h5l-1.5 8.3L18.5 10.6h-5.2z"/><path d="M19.6 2.4l.7 1.7 1.7.7-1.7.7-.7 1.7-.7-1.7-1.7-.7 1.7-.7zM3.6 3.2l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2L2 4.9l1.2-.5z"/>',
    'Boost Level 4': '<path d="M13 2.5L5.5 13.2h5l-1.5 8.3L18.5 10.6h-5.2z"/><path d="M19.6 2.4l.7 1.7 1.7.7-1.7.7-.7 1.7-.7-1.7-1.7-.7 1.7-.7zM3.6 3.2l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2L2 4.9l1.2-.5zM21 10.2l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5z"/>',
    'Boost Level 5': '<path d="M13 2.5L5.5 13.2h5l-1.5 8.3L18.5 10.6h-5.2z"/><path d="M19.6 2.4l.7 1.7 1.7.7-1.7.7-.7 1.7-.7-1.7-1.7-.7 1.7-.7zM3.6 3.2l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2L2 4.9l1.2-.5zM21 10.2l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5zM2 10.6l.4 1 1 .4-1 .4-.4 1-.4-1-1-.4 1-.4z"/>',
    'Boost Level 6': '<path d="M13 2.5L5.5 13.2h5l-1.5 8.3L18.5 10.6h-5.2z"/><path d="M19.6 2.4l.7 1.7 1.7.7-1.7.7-.7 1.7-.7-1.7-1.7-.7 1.7-.7zM3.6 3.2l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2L2 4.9l1.2-.5zM21 10.2l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5zM2 10.6l.4 1 1 .4-1 .4-.4 1-.4-1-1-.4 1-.4z"/><path d="M4 2.4l.4 1 1 .4-1 .4-.4 1-.4-1-1-.4 1-.4z"/>',
    'Boost Level 7': '<path d="M13 2.5L5.5 13.2h5l-1.5 8.3L18.5 10.6h-5.2z"/><path d="M19.6 2.4l.7 1.7 1.7.7-1.7.7-.7 1.7-.7-1.7-1.7-.7 1.7-.7zM3.6 3.2l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2L2 4.9l1.2-.5zM21 10.2l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5zM2 10.6l.4 1 1 .4-1 .4-.4 1-.4-1-1-.4 1-.4zM4 2.4l.4 1 1 .4-1 .4-.4 1-.4-1-1-.4 1-.4zM19.8 17.8l.4 1 1 .4-1 .4-.4 1-.4-1-1-.4 1-.4z"/>',
    'Boost Level 8': '<path d="M13 2.5L5.5 13.2h5l-1.5 8.3L18.5 10.6h-5.2z"/><path d="M19.6 2.4l.7 1.7 1.7.7-1.7.7-.7 1.7-.7-1.7-1.7-.7 1.7-.7zM3.6 3.2l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2L2 4.9l1.2-.5zM21 10.2l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5zM2 10.6l.4 1 1 .4-1 .4-.4 1-.4-1-1-.4 1-.4zM4 2.4l.4 1 1 .4-1 .4-.4 1-.4-1-1-.4 1-.4zM19.8 17.8l.4 1 1 .4-1 .4-.4 1-.4-1-1-.4 1-.4zM4.2 17.6l.4 1 1 .4-1 .4-.4 1-.4-1-1-.4 1-.4z"/>',
    'Boost Level 9': '<path d="M13 2.5L5.5 13.2h5l-1.5 8.3L18.5 10.6h-5.2z"/><path d="M19.6 2.4l.7 1.7 1.7.7-1.7.7-.7 1.7-.7-1.7-1.7-.7 1.7-.7zM3.6 3.2l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2L2 4.9l1.2-.5zM21 10.2l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5zM2 10.6l.4 1 1 .4-1 .4-.4 1-.4-1-1-.4 1-.4zM4 2.4l.4 1 1 .4-1 .4-.4 1-.4-1-1-.4 1-.4zM19.8 17.8l.4 1 1 .4-1 .4-.4 1-.4-1-1-.4 1-.4zM4.2 17.6l.4 1 1 .4-1 .4-.4 1-.4-1-1-.4 1-.4zM11.6 3.4l.4 1 1 .4-1 .4-.4 1-.4-1-1-.4 1-.4z"/>',

    // People and programmes
    'Discord Staff': '<path d="M12 2.6l7.4 3v6.1c0 4.2-3 8.1-7.4 9.7-4.4-1.6-7.4-5.5-7.4-9.7V5.6z"/><path d="M9.4 12.1l1.9 1.9 3.4-3.6"/>',
    'Partner': '<path d="M8.4 12.8l-2 2a2.3 2.3 0 003.3 3.2l2.4-2.3M15.6 12.8l2 2a2.3 2.3 0 01-3.3 3.2l-2.4-2.3"/><path d="M12 20.4l-3.6-3.6 6-6.5M12 20.4l3.6-3.6-6-6.5"/>',
    'HypeSquad Events': '<path d="M12 2.8l2.3 4.9 5.3.7-3.9 3.7 1 5.3-4.7-2.6-4.7 2.6 1-5.3-3.9-3.7 5.3-.7z"/><path d="M12 7v6.4M8.8 10.2h6.4"/>',
    'HypeSquad Bravery': '<path d="M13.2 2.6L5 13.4h5.4L8.6 21.4 19 10.4h-5.6z"/>',
    'HypeSquad Brilliance': '<path d="M12 2.6a6.6 6.6 0 016.6 6.6c0 5.2-6.6 12.2-6.6 12.2S5.4 14.4 5.4 9.2A6.6 6.6 0 0112 2.6z"/><path d="M12 7.2v5.6M9.2 10h5.6"/>',
    'HypeSquad Balance': '<path d="M12 3.4v17.2M6 7.2h12"/><path d="M6 7.2L3 13.4h6zM18 7.2L15 13.4h6z"/>',
    'Early Supporter': '<path d="M12 3l2.6 5.6 6.1.8-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.4l6.1-.8z"/>',
    'Team User': '<circle cx="12" cy="8" r="3.6"/><path d="M4.8 20.2a7.2 7.2 0 0114.4 0"/>',

    // Bugs and moderation
    'Bug Hunter Level 1': '<path d="M8.6 9.4a3.4 3.4 0 016.8 0"/><path d="M7.4 9.4h9.2v4.4a4.6 4.6 0 01-9.2 0z"/><path d="M7.4 11.2H4.2M7.4 14.2H4.6M19.8 11.2h-3.2M19.4 14.2h-2.8M9.6 9.4L8 6.8M14.4 9.4L16 6.8"/>',
    'Bug Hunter Level 2': '<path d="M8.6 9.4a3.4 3.4 0 016.8 0"/><path d="M7.4 9.4h9.2v4.4a4.6 4.6 0 01-9.2 0z"/><path d="M7.4 11.2H4.2M7.4 14.2H4.6M19.8 11.2h-3.2M19.4 14.2h-2.8M9.6 9.4L8 6.8M14.4 9.4L16 6.8"/><path d="M19.4 3.2l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5z"/>',
    'Discord Certified Moderator': '<path d="M12 2.6l7.4 3v6.1c0 4.2-3 8.1-7.4 9.7-4.4-1.6-7.4-5.5-7.4-9.7V5.6z"/><path d="M9.2 12.2l2 2 3.6-3.9"/>',
    'Verified Developer': '<path d="M8.6 7.4L4.8 12l3.8 4.6M15.4 7.4L19.2 12l-3.8 4.6M13.4 5.2l-2.8 13.6"/>',

    // Programs
    'Active Developer': '<path d="M9.2 6.6L3.8 12l5.4 5.4M14.8 6.6L20.2 12l-5.4 5.4"/>',
    'Verified Bot Developer': '<path d="M12 2.6l7.4 3v6.1c0 4.2-3 8.1-7.4 9.7-4.4-1.6-7.4-5.5-7.4-9.7V5.6z"/><path d="M9.2 12.2l2 2 3.6-3.9"/>',
    'Moderator Program Alumni': '<path d="M12 3.2l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.8-5.1 2.8 1-5.7-4.1-4 5.7-.8z"/><path d="M8.6 13.6l2.4 2.4 4.4-4.6"/>',

    // Gift tiers. A present with one pip per tier reached, so the fallback
    // still shows which tier it is if the artwork ever fails to load. The real
    // gift artwork is used whenever it is available.
    'Patron': '<path d="M4.6 9.8h14.8v6.4a1.4 1.4 0 01-1.4 1.4H6a1.4 1.4 0 01-1.4-1.4z"/><path d="M3.8 7h16.4v2.8H3.8z"/><path d="M10.6 7h2.8v12.6h-2.8z"/><path d="M12 7C10.4 3 6 3.8 7.2 6.4c.6 1.3 2.6 1.5 4.8.6zM12 7c1.6-4 6-3.2 4.8-.6-.6 1.3-2.6 1.5-4.8.6z"/><path d="M12 20.6h.01"/>',
    'Champion': '<path d="M4.6 9.8h14.8v6.4a1.4 1.4 0 01-1.4 1.4H6a1.4 1.4 0 01-1.4-1.4z"/><path d="M3.8 7h16.4v2.8H3.8z"/><path d="M10.6 7h2.8v12.6h-2.8z"/><path d="M12 7C10.4 3 6 3.8 7.2 6.4c.6 1.3 2.6 1.5 4.8.6zM12 7c1.6-4 6-3.2 4.8-.6-.6 1.3-2.6 1.5-4.8.6z"/><path d="M10 20.6h.01M14 20.6h.01"/>',
    'Luminary': '<path d="M4.6 9.8h14.8v6.4a1.4 1.4 0 01-1.4 1.4H6a1.4 1.4 0 01-1.4-1.4z"/><path d="M3.8 7h16.4v2.8H3.8z"/><path d="M10.6 7h2.8v12.6h-2.8z"/><path d="M12 7C10.4 3 6 3.8 7.2 6.4c.6 1.3 2.6 1.5 4.8.6zM12 7c1.6-4 6-3.2 4.8-.6-.6 1.3-2.6 1.5-4.8.6z"/><path d="M8.7 20.6h.01M12 20.6h.01M15.3 20.6h.01"/>',
    'Icon': '<path d="M4.6 9.8h14.8v6.4a1.4 1.4 0 01-1.4 1.4H6a1.4 1.4 0 01-1.4-1.4z"/><path d="M3.8 7h16.4v2.8H3.8z"/><path d="M10.6 7h2.8v12.6h-2.8z"/><path d="M12 7C10.4 3 6 3.8 7.2 6.4c.6 1.3 2.6 1.5 4.8.6zM12 7c1.6-4 6-3.2 4.8-.6-.6 1.3-2.6 1.5-4.8.6z"/><path d="M8 20.6h.01M10.7 20.6h.01M13.3 20.6h.01M16 20.6h.01"/>',
    'Hero': '<path d="M4.6 9.8h14.8v6.4a1.4 1.4 0 01-1.4 1.4H6a1.4 1.4 0 01-1.4-1.4z"/><path d="M3.8 7h16.4v2.8H3.8z"/><path d="M10.6 7h2.8v12.6h-2.8z"/><path d="M12 7C10.4 3 6 3.8 7.2 6.4c.6 1.3 2.6 1.5 4.8.6zM12 7c1.6-4 6-3.2 4.8-.6-.6 1.3-2.6 1.5-4.8.6z"/><path d="M7.4 20.6h.01M9.7 20.6h.01M12 20.6h.01M14.3 20.6h.01M16.6 20.6h.01"/>',
    'Legend': '<path d="M4.6 9.8h14.8v6.4a1.4 1.4 0 01-1.4 1.4H6a1.4 1.4 0 01-1.4-1.4z"/><path d="M3.8 7h16.4v2.8H3.8z"/><path d="M10.6 7h2.8v12.6h-2.8z"/><path d="M12 7C10.4 3 6 3.8 7.2 6.4c.6 1.3 2.6 1.5 4.8.6zM12 7c1.6-4 6-3.2 4.8-.6-.6 1.3-2.6 1.5-4.8.6z"/><path d="M6.8 20.6h.01M9 20.6h.01M11.2 20.6h.01M13.4 20.6h.01M15.6 20.6h.01M17.2 20.6h.01"/>'
  };

  // Loose matching so minor naming differences still resolve to an icon.
  var ALIASES = {
    'nitro prime': 'Nitro',
    'boost': 'Boost Level 0',
    'hypesquad': 'HypeSquad Events',
    'hypesquad bravery': 'HypeSquad Bravery',
    'hypesquad brilliance': 'HypeSquad Brilliance',
    'hypesquad balance': 'HypeSquad Balance',
    'bughunter': 'Bug Hunter Level 1',
    'bughunter1': 'Bug Hunter Level 1',
    'bughunterlevel1': 'Bug Hunter Level 1',
    'bug hunter 1': 'Bug Hunter Level 1',
    'bughunter2': 'Bug Hunter Level 2',
    'bughunterlevel2': 'Bug Hunter Level 2',
    'bug hunter 2': 'Bug Hunter Level 2',
    'staff': 'Discord Staff',
    'discordstaff': 'Discord Staff',
    'mod': 'Discord Certified Moderator',
    'certifiedmoderator': 'Discord Certified Moderator',
    'dev': 'Verified Developer',
    'boostlevel1': 'Boost Level 1',
    'boostlevel2': 'Boost Level 2',
    'boostlevel3': 'Boost Level 3',
    'boostlevel0': 'Boost Level 0',
    // Legacy names kept so accounts saved before the rename still resolve.
    'boosttier1': 'Boost Level 1',
    'boosttier2': 'Boost Level 2',
    'boosttier3': 'Boost Level 3',
    'boosttier4': 'Boost Level 4',
    'boosttier5': 'Boost Level 5',
    'boosttier6': 'Boost Level 6',
    'boosttier7': 'Boost Level 7',
    'boosttier8': 'Boost Level 8',
    'boosttier9': 'Boost Level 9',
    'boosttier0': 'Boost Level 0',
    // The main profile tool names the gift tiers after the donor, so accept
    // either that or the level it awards when resolving a stored label.
    'giftlvl1': 'Patron',
    'giftlvl2': 'Champion',
    'giftlvl3': 'Luminary',
    'giftlvl4': 'Icon',
    'giftlvl5': 'Hero',
    'giftlvl6': 'Legend',
    'giftlevel1': 'Patron',
    'giftlevel2': 'Champion',
    'giftlevel3': 'Luminary',
    'giftlevel4': 'Icon',
    'giftlevel5': 'Hero',
    'giftlevel6': 'Legend',
    'gift1': 'Patron',
    'gift2': 'Champion',
    'gift3': 'Luminary',
    'gift4': 'Icon',
    'gift5': 'Hero',
    'gift6': 'Legend',
    'giftbadge': 'Patron'
  };

  // Badge labels are stored as free text in the database, so rows saved before
  // the rename still carry the old wording. These map the old wording onto the
  // current name so existing accounts keep their icon, keep ticking the right
  // box in the picker, and display consistently with newly added ones. Rows
  // are migrated to the new wording the next time they are saved.
  var RENAMES = {
    'boost tier 0': 'Boost Level 0',
    'boost tier 1': 'Boost Level 1',
    'boost tier 2': 'Boost Level 2',
    'boost tier 3': 'Boost Level 3',
    'boost tier 4': 'Boost Level 4',
    'boost tier 5': 'Boost Level 5',
    'boost tier 6': 'Boost Level 6',
    'boost tier 7': 'Boost Level 7',
    'boost tier 8': 'Boost Level 8',
    'boost tier 9': 'Boost Level 9',
    'boost tier': 'Boost Level 0',
    'bug hunter': 'Bug Hunter Level 1',
    'bug hunter level 1': 'Bug Hunter Level 1',
    'certified moderator': 'Discord Certified Moderator',
    'discord certified moderator': 'Discord Certified Moderator',
    'nitro prime': 'Nitro',
    'moderator program alumni': 'Moderator Program Alumni'
  };

  function normalise(label) {
    return String(label === undefined || label === null ? '' : label)
      .replace(/[\s_-]+/g, ' ')
      .trim()
      .toLowerCase();
  }

  var BY_KEY = {};
  Object.keys(GLYPHS).forEach(function (label) {
    BY_KEY[normalise(label)] = label;
  });

  function resolve(label) {
    var key = normalise(label);
    if (!key) return null;
    if (BY_KEY[key]) return BY_KEY[key];
    // Strip a trailing level/tier marker before alias matching.
    var compact = key.replace(/\s+/g, '');
    if (ALIASES[compact]) return ALIASES[compact];
    if (ALIASES[key]) return ALIASES[key];
    return null;
  }

  function has(label) {
    return !!resolve(label);
  }

  // The current display name for a badge, or the input unchanged when it is a
  // custom badge we do not recognise. Used for display and for picker
  // matching so a row saved under the old wording behaves like a new one.
  function canonical(label) {
    var raw = String(label === undefined || label === null ? '' : label);
    var key = normalise(raw);
    if (!key) return '';
    if (BY_KEY[key]) return BY_KEY[key];
    if (RENAMES[key]) return RENAMES[key];
    var compact = key.replace(/\s+/g, '');
    if (ALIASES[compact]) return ALIASES[compact];
    if (ALIASES[key]) return ALIASES[key];
    // Unknown or custom: hand it back untouched.
    return raw;
  }

  // Returns an inline <svg> string, or '' when the label is unknown.
  // width/height are set on the element itself rather than only in the
  // stylesheet: an SVG with a viewBox but no intrinsic size collapses to
  // nothing, which would hide the icon entirely whenever the page is served
  // a cached copy of the CSS.
  function svg(label, className) {
    var key = resolve(label);
    if (!key) return '';
    var cls = className ? ' class="' + className + '"' : ' class="badge-icon"';
    return '<svg' + cls + ' width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
      + ' stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"'
      + ' aria-hidden="true" focusable="false">' + GLYPHS[key] + '</svg>';
  }

  // The real badge image when we have one, otherwise the inline glyph. This is
  // what the pickers and tables use.
  //
  // The image is sized on the element itself, because an image with no
  // intrinsic dimensions collapses to nothing and the badge would look absent.
  // alt is empty on purpose: the badge name is always rendered next to it, so
  // announcing the image too would just repeat the label to a screen reader.
  function media(label, className) {
    var src = asset(label);
    if (!src) return svg(label, className);
    var cls = className ? ' class="' + className + '"' : ' class="badge-icon"';
    return '<img' + cls + ' src="' + src + '" width="18" height="18" alt=""'
      + ' loading="lazy" decoding="async">';
  }

  // A badge chip: icon plus label, with the label kept for screen readers and
  // for anyone who cannot distinguish the glyph. The label is canonicalised so
  // rows saved before a rename still display the current wording.
  function chip(label, className) {
    var name = canonical(label);
    var text = String(name === undefined || name === null ? '' : name);
    var cls = className ? className : 'chip-tag';
    return '<span class="' + cls + '">' + media(text) + '<span class="badge-label">' + escapeHtml(text) + '</span></span>';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  global.BadgeIcons = {
    svg: svg, media: media, chip: chip, has: has, resolve: resolve,
    asset: asset, canonical: canonical, labels: Object.keys(GLYPHS),
    assets: ASSETS, assetBase: ASSET_BASE
  };
})(typeof window !== 'undefined' ? window : globalThis);
