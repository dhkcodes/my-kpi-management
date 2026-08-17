/**
  Copyright (c) 2015, 2026, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/

'use strict';

const path = require('path');

module.exports = function (configObj) {
  return new Promise((resolve) => {
    console.log('Running before_serve hook with SPA history fallback.');
    const spaHistoryFallback = (request, _response, next) => {
      const acceptsHtml = `${request.headers.accept ?? ''}`.includes('text/html');
      if (request.method === 'GET' && acceptsHtml && !path.extname(request.path ?? request.url)) {
        request.url = '/';
      }
      next();
    };
    configObj.preMiddleware = [spaHistoryFallback, ...(configObj.preMiddleware ?? [])];
    resolve(configObj);
  });
};
