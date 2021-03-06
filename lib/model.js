'use strict';
var _ = require('lodash');
var squel = require('squel');
var when = require('when');
var sequence = require('when/sequence');

var enforceValue = function(name, message) {
  if(!name) {
    throw new Error(message);
  }
};

var defaultValue = function(obj, val) {
  return obj || val;
};

var Model = function(opts) {
  enforceValue(opts, 'You must initialise a model with the request parameters: table');  
  enforceValue(opts.table, 'You must initialise a model with the table option');
  enforceValue(opts.identity, 'You must initialise a model with the id option');

  var items = [];

  var trim = function(item) {
    delete item._meta;
    delete item[opts.identity];
  };

  var clear = function() {
    items = [];
  };

  var executeSelect = function(query) {
    return when.promise(function(resolve) {
      opts.dal.execute(query.toString()).then(function(results) {
        for(var x = 0; x < results.length; x++) {
          var result = results[x];
          result = create(result, {
            existing: true
          });
        }
        resolve(results);
      });
    });
  };

  var select = function(selectOpts) {
    selectOpts = selectOpts || {};
    var query = squel
      .select()
      .from(opts.table);

    query.go = function() {
      if(selectOpts.bulk) {
       return opts.dal.execute(query.toString());
      } else {
       return executeSelect(query);
      } 
    };
    return query;
  };


  var executeDelete = function() {
    return opts.dal.execute(this.toString());
  };

  var deleteItems = function() {
    var query = squel
      .delete()
      .from(opts.table);

    query.go = executeDelete;
    return query;
  };

  var save = function(saveOpts) {
    saveOpts = defaultValue(saveOpts, {});    
    saveOpts.bulk = defaultValue(saveOpts.bulk, false);

    var insertMe =_.filter(items, function(item) {
      return item._meta.existing === false;
    });

    var updateMe =_.filter(items, function(item) {
      return item._meta.modified() === true && item._meta.existing === true;
    });

    // TODO: Far too many clones going on here, need a better
    // way to remove the _meta property from the setFieldsRows
    // perhaps _.map or _.reduce
    // At the moment this will insert one by one and get the identity
    // for ORM purposes, however it's much quicker to bulk insert
    // but then theres no identity.  Perhaps a save {bulk: true} is needed?
    var delegates = [];

    var generateBulkInsert = function() {
      var insertingItems = _.cloneDeep(insertMe);
      for(var x = 0; x < insertingItems.length; x++) {
        var insertingItem = insertingItems[x];
        delete insertingItem._meta;
      }
      var sql = squel.insert()
        .into(opts.table)
        .setFieldsRows(insertingItems)
        .toString();
      var insertPromise = function() {
        return when.promise(function(resolve) {
          return opts.dal.execute(sql).then(function() {
            items = items.filter(function(i) { return items.indexOf(i) < 0; });
            resolve();
          });
        });
      };
      delegates.push(insertPromise);
    };

    var addInsertPromise = function(sql, insertMeItem, insertingItem) {
      var insertPromise = function() {
        return when.promise(function(resolve) {
          return opts.dal.execute(sql).then(function() {
            return opts.dal.getLastInsertedId(opts.table)
              .then(function(id) {
                insertMeItem._meta.original = insertingItem;
                insertMeItem._meta.existing = true;
                if(id !== null) {
                  insertMeItem[opts.identity] = id;
                }
                resolve();
              });
          });
        });
      };
      delegates.push(insertPromise);
    };

    var generateOrmInsert = function() {
      for(var x = 0; x < insertMe.length; x++) {
        var insertMeItem = insertMe[x];
        var insertingItem = _.cloneDeep(insertMeItem);
        delete insertingItem._meta;
        var sql = squel.insert()
          .into(opts.table)
          .setFields(insertingItem)
          .toString();
        addInsertPromise(sql, insertMeItem, insertingItem);
      }
    };

    var addUpdatePromise = function(sql, updateMeItem, updatingItem) {
      var updatePromise = function() {
        return when.promise(function(resolve) {
          return opts.dal.execute(sql).then(function() {
            updateMeItem._meta.original = updatingItem;
            resolve();
          });
        });
      };
      delegates.push(updatePromise);
    };

    var generateOrmUpdate = function() {
      for(var x = 0; x < updateMe.length; x++) {
        var updateMeItem = updateMe[x];
        if(!updateMeItem[opts.identity]) {
          throw new Error('A model flagged for update must have an identifier set');
        }
        var updatingItem = _.cloneDeep(updateMeItem);
        var id = updateMeItem[opts.identity];
        trim(updatingItem);
        var sql = squel.update()
          .table(opts.table)
          .setFields(updatingItem)
          .where(opts.identity + ' = ' + id)
          .toString();
        addUpdatePromise(sql, updateMeItem, updatingItem);
      }
    };

    if(saveOpts.bulk) {
      generateBulkInsert();
    } else {
      generateOrmInsert();
    }

    generateOrmUpdate();
    return sequence(delegates);
  };

  var create = function(item, meta) {
    item._meta = {
      existing: false,
      original: _.clone(item)
    };
    item._meta = _.merge(item._meta, meta);
    item._meta.modified = function() {
      var sample = _.clone(item);
      // Sanitise the sample object
      trim(sample);
      // Remove the identity from the meta
      trim(item._meta.original);
      // Compare the two to find out if they've changed
      return !_.isEqual(sample, item._meta.original);
    };

    items.push(item);
    return item;
  };

  return Object.freeze({
    save: save,
    select: select,
    delete: deleteItems,
    clear: clear,
    create: create,
    trackedItems: function() {
      return items.length;
    }
  });
};

module.exports = Model;
