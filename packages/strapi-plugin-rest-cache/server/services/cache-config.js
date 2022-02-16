'use strict';

/**
 * @typedef {import('../types').CachePluginStrategy} CachePluginStrategy
 * @typedef {import('../types').CacheContentTypeConfig} CacheContentTypeConfig
 * @typedef {import('@strapi/strapi').Strapi} Strapi
 */

const { getRouteRegExp } = require('../utils/config/getRouteRegExp');

/**
 * @param {{ strapi: Strapi }} strapi
 */
module.exports = ({ strapi }) => ({
  /**
   * Get all uid of cached contentTypes
   *
   * uid:
   * - api::sport.sport
   * - plugin::users-permissions.user
   *
   * @return {string[]}
   */
  getUids() {
    const { strategy } = strapi.config.get('plugin.strapi-plugin-rest-cache');
    return strategy.contentTypes.map((cacheConf) => cacheConf.contentType);
  },

  /**
   * Return the intersection of cached contentTypes and the related contentTypes of a given contentType uid
   *
   * uid:
   * - api::sport.sport
   * - plugin::users-permissions.user
   *
   * @return {string[]}
   */
  getRelatedCachedUid(uid) {
    const cacheConf = this.get(uid);
    if (!cacheConf) {
      return [];
    }

    const cached = this.getUids();
    const related = cacheConf.relatedContentTypeUid;

    return related.filter((relatedUid) => cached.includes(relatedUid));
  },

  /**
   * Get related ModelCacheConfig with an uid
   *
   * uid:
   * - api::sport.sport
   * - plugin::users-permissions.user
   *
   * @param {string} uid
   * @return {CacheContentTypeConfig | undefined}
   */
  get(uid) {
    const { strategy } = strapi.config.get('plugin.strapi-plugin-rest-cache');
    return strategy.contentTypes.find(
      (cacheConf) => cacheConf.contentType === uid
    );
  },

  /**
   * Get regexs to match all ModelCacheConfig keys with given params
   *
   * @param {string} uid
   * @param {any} params
   * @param {boolean=} wildcard
   * @return {RegExp[]}
   */
  getCacheKeysRegexp(uid, params, wildcard = false) {
    const cacheConf = this.get(uid);
    if (!cacheConf) {
      return [];
    }

    const regExps = [];

    const routes = cacheConf.routes.filter((route) => route.method === 'GET');

    for (const route of routes) {
      regExps.push(...getRouteRegExp(route, params, wildcard));
    }

    return regExps;
  },

  /**
   * Check if a cache configuration exists for a contentType uid
   *
   * uid:
   * - api::sport.sport
   * - plugin::users-permissions.user
   *
   * @param {string} uid
   * @return {boolean}
   */
  isCached(uid) {
    return !!this.get(uid);
  },

  async clearCache(uid, params = {}, wildcard = false) {
    const { strategy } = strapi.config.get('plugin.strapi-plugin-rest-cache');

    const cacheConfigService = strapi
      .plugin('strapi-plugin-rest-cache')
      .service('cacheConfig');

    const storeService = strapi
      .plugin('strapi-plugin-rest-cache')
      .service('cacheStore');

    const cacheConf = cacheConfigService.get(uid);

    if (!cacheConf) {
      throw new Error(
        `Unable to clear cache: no configuration found for contentType "${uid}"`
      );
    }

    const keys = (await storeService.keys()) || [];
    const regExps = cacheConfigService.getCacheKeysRegexp(
      uid,
      params,
      wildcard
    );

    if (strategy.clearRelatedCache) {
      for (const relatedUid of cacheConf.relatedContentTypeUid) {
        if (cacheConfigService.isCached(relatedUid)) {
          // clear all cache because we can't predict uri params
          regExps.push(
            ...cacheConfigService.getCacheKeysRegexp(relatedUid, {}, true)
          );
        }
      }
    }

    /**
     * @param {string} key
     */
    const shouldDel = (key) => regExps.find((r) => r.test(key));

    /**
     * @param {string} key
     */
    const del = (key) => storeService.del(key);

    await Promise.all(keys.filter(shouldDel).map(del));
  },
});
