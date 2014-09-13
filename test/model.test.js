'use strict';
var Model = require('../lib/model');
var should = require('should');
var when = require('when');

/*jshint -W068 */
describe('morm Model', function() {

  it('Should initialise ok', function() {
    var model = new Model({
      table: 'morm_test',
      identity: 'id'
    });
    model.should.not.eql(null);
  });

  it('Should require an options object to be passed', function() {
    (function() {
      var model = new Model();
      should(model).eql(null);
    }).should.throw('You must initialise a model with the request parameters: table');
  });

  it('Should require the id parameter', function() {
    (function() {
      var model = new Model({
        table: 'morm_test'
      });
      should(model).eql(null);
    }).should.throw('You must initialise a model with the id option');
  });

  it('Should require the table name parameter', function() {
    (function() {
      var model = new Model({
        identity: 'id'
      });
      should(model).eql(null);
    }).should.throw('You must initialise a model with the table option');
  });

  it('Should be able to create an instance of my model with a single data object', function() {
    var myModel = new Model({
      table: 'morm_test',
      identity: 'id'
    });
    var myObject = myModel.create({
      column1: 'hi', 
      column2: 'hi again'
    });
    myObject.column1.should.eql('hi');
    myObject.column2.should.eql('hi again');
  });

  it('Should say the model has been modified when it has', function() {
    var myModel = new Model({
      table: 'morm_test',
      identity: 'id'
    });
    var myObject = myModel.create({
      column1: 'hi', 
      column2: 'hi again'
    });

    myObject.column2 = 'I have changed';
    myObject._meta.modified().should.eql(true);
  });

  it('Should say the model hasnt been modified when it hasnt', function() {
    var myModel = new Model({
      table: 'morm_test',
      identity: 'id'
    });
    var myObject = myModel.create({
      column1: 'hi', 
      column2: 'hi again'
    });
    myObject._meta.modified().should.eql(false);
  });

  describe('Sql generation', function() {
    var executed = [];
    var autoid = 0;
    var dal = {
      execute: function(sql) {
        return when.promise(function(resolve) {
          executed.push(sql);
          resolve();
        });
      },
      getLastInsertedId: function() {
        return when.promise(function(resolve) {
          autoid ++;
          resolve(autoid);
        });
      }
    };

    beforeEach(function() {
      executed = [];
    });

    it('Should build a single insert statement for a new model', function(done) {
      var myModel = new Model({
        table: 'morm_test',
        identity: 'id',
        dal: dal
      });
      myModel.create({
        column1: 'hi', 
        column2: 'hi again'
      });

      myModel.save().then(function() {
        executed.length.should.eql(1);
        executed[0].should.match(/^INSERT INTO morm_test \(column1, column2\) VALUES \([^\(\)]*\)$/i);
        done();
      });
    });

    it('Should throw an error if a model is flagged for update but has no id', function() {
      (function() {
        var model = new Model({
          table: 'example_table',
          identity: 'id',
          dal: dal
        });
        var item = model.create({
          column1: 'hi', 
          column2: 'hi again'
        }, {
          existing: true
        });

        item.column1 = 'changed';
        model.save();
      }).should.throw('A model flagged for update must have an identifier set');
    });

    it('Should be flagged as an existing item after its been inserted', function(done) {
      var myModel = new Model({
        table: 'morm_test',
        identity: 'id',
        dal: dal
      });
      var item = myModel.create({
        column1: 'hi', 
        column2: 'hi again'
      });

      myModel.save().then(function() {
        item._meta.existing.should.eql(true);
        done();
      });
    });

    it('Should set the id property on a model after an insert', function(done) {
      var myModel = new Model({
        table: 'morm_test',
        identity: 'id',
        dal: dal
      });
      var item = myModel.create({
        column1: 'hi', 
        column2: 'hi again'
      });

      myModel.save().then(function() {
        item.id.should.not.eql(null);
        done();
      });
    });

    it('Should set the id property on a model after multiple inserts', function(done) {
      var myModel = new Model({
        table: 'morm_test',
        identity: 'id',
        dal: dal
      });
      var item = myModel.create({
        column1: 'hi', 
        column2: 'hi again'
      });
      var item2 = myModel.create({
        column1: 'hi', 
        column2: 'hi again'
      });

      myModel.save().then(function() {
        item.id.should.not.eql(null);
        item2.id.should.not.eql(null);
        done();
      });
    });

    it('Should build an update statement for an existing modified model', function(done) {
      var myModel = new Model({
        table: 'morm_test',
        identity: 'id',
        dal: dal
      });
      var item = myModel.create({
        id: 1,
        column1: 'hi', 
        column2: 'hi again'
      }, {
        existing: true
      });

      item.column1 = 'updated';
      myModel.save().then(function() {
        executed.length.should.eql(1);
        executed[0].should.match(/^UPDATE morm_test .* WHERE \(id = .*/i);
        done();
      });
    });

    // This is skipped as we now insert one row at a time so that we can get the ID back
    it.skip('Should build a multiple insert statement when there are several models', function(done) {
      var myModel = new Model({
        table: 'morm_test',
        identity: 'id',
        dal: dal
      });
      myModel.create({
        column1: 'hi', 
        column2: 'hi again'
      });
      myModel.create({
        column1: 'another hi', 
        column2: 'to you'
      });
      myModel.save().then(function() {
        executed.length.should.eql(1);
        executed[0].should.match(/^INSERT INTO morm_test \(column1, column2\) VALUES \([^\(\)]*\), \([^\(\)]*\)$/i);
        done();
      });

    });

    it('Should build a mixture of inserts and updates when applicable', function(done) {
      var myModel = new Model({
        table: 'morm_test',
        identity: 'id',
        dal: dal
      });
      var updated = myModel.create({
        id: 1,
        column1: 'hi', 
        column2: 'hi again'
      }, {
        existing: true
      });
      updated.column1 = 'updated';

      myModel.create({
        column1: 'another hi', 
        column2: 'to you'
      });
      myModel.save().then(function() {
        executed.length.should.eql(2);
        executed[0].should.match(/^INSERT INTO morm_test \(column1, column2\) VALUES \([^\(\)]*\)$/i);
        executed[1].should.match(/^UPDATE morm_test .* WHERE \(id = .*/i);
        done();
      });

    });

    it('Should do an update after an insert of the same model', function(done) {
      var myModel = new Model({
        table: 'morm_test',
        identity: 'id',
        dal: dal
      });
      var item = myModel.create({
        column1: 'hi', 
        column2: 'hi again'
      });

      myModel.save().then(function() {
        item.column2 = 'updated';
        myModel.save().then(function() {
          executed.length.should.eql(2);
          executed[0].should.match(/^INSERT INTO morm_test \(column1, column2\) VALUES \([^\(\)]*\)$/i);
          executed[1].should.match(/^UPDATE morm_test .* WHERE \(id = .*/i);
          done();
        });
      });
    });


    it('Should not update a model that hasnt been modified', function(done) {
      var myModel = new Model({
        table: 'morm_test',
        identity: 'id',
        dal: dal
      });
      myModel.create({
        id: 1,
        column1: 'hi', 
        column2: 'hi again'
      });

      myModel.save().then(function() {
        myModel.save().then(function() {
          executed.length.should.eql(1);
          done();
        });
      });
    });


  });

});
