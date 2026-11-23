// Public feature switches.
//
// RESTAURANTS_PUBLIC: the restaurant listing still holds sample shops, so it
// is hidden from visitors (owner decision, 2026-11-23). While false, the
// landing strip, the topic tile, the header/footer links and every
// /[locale]/restaurants page are off (the pages answer 404). The admin
// screens keep working so real shops can be prepared. Flip to true once the
// listing has real shops.
export const RESTAURANTS_PUBLIC = false;
