/***

MochiKit.MochiChi 1.5

(c) 2009 Benjamin Kampmann.  All rights Reserved.

***/

MochiKit.Base._module('MochiChi', '1.5', ['Base', 'Async', 'Signal', 'DOM']);

/** @id MochiKit.MochiChi.Connection
 * 
 * signals:
 *      state - the current state the Connection is in
 *      new_
 * */
MochiKit.MochiChi.RawConnection = function (url) {
    this.connected = False;
    this.url = url ? url: '/http-bind';
    this.id = this._nextId();
    this.spool = [];
    this.lang = 'en';
    this.session_id = null;
    this.rid = null;

    // should not be changed right now
    this.version = '1.6';
    this.wait = 60; // FIXME: make this dynamic by looking at the browser
    this.hold = 1; // this should not be changed ever

  }

MochiKit.MochiChi.RawConnection.prototype =  {
    connect: function(url) {

      if (this.connected)
        throw "Connection already/still connected"

        attrs = {
          'to' : 'jabber.org', // FIXME: do a correct look up here
          'xml:lang': this.lang,
          'ver': this.version,
          'wait': this.wait,
          'hold': this.hold,
        }
      body = this._create_body(attrs);
      return body;
    },

    send: function(data) {
      this.spool.push(data);
      this._schedule_send();

    },

    _create_body: function(attrs) {
      var body = document.createElement('body');
      attrs['xmlns'] = 'http://jabber.org/protocol/httpbind';
      MochiKit.DOM.updateNodeAttributes(body, attrs);
      return body
    },
  
    _create_session_body: function() {
      attrs = {
          wait: this.wait,
          rid: MochiKit.Base.Counter(this.rid)
        }

      if (this.session_id) {
        attrs['sid'] = this.session_id;
      }
      return this._create_body(attrs);
    },

    _schedule_send: function() {
       
    },

    repr: function () {
        return 'Connection(' + this.id + ', ' + this.connected + ')';
    },

    disconnect: function () {
      // close any still open connections
      // clean up still open requests  
    },


    toString: MochiKit.Base.forwardCall("repr"),
    _nextId: MochiKit.Base.counter()
  }


/** @id MochiKit.MochiChi.Connection
 * 
 * signals:
 *      state - the current state the Connection is in
 *      
 * */
MochiKit.MochiChi.Connection = function(service_url) {
    this.connection = new MochiKit.MochiChi.RawConnection(service_url);
    this.jid = null;
    this.password = null;
  }

MochiKit.MochiChi.Connection.prototype = {
    connect: function (jid, password) {

      this.jid = jid;
      this.password = password;

      var dfr = null;
      if (!this.connection.connected) {
        dfr = this.connection.connect();
      } else {
        dfr = MochiKit.Async.succeed('done');
      }
      dfr.addCallback(this._login);
      return dfr
  },

  _login: function () {
    // do actually something here
  },

  disconnect: function() {
    
  }

}

MochiKit.Base.update(MochiKit.MochiChi, {
    parse_jid: function(jid) {
      var results = {
        user: null,
        domain: null,
        resource: null
      }

      // syntax is [user@]domain[/resource]
      var splitted_domain = jid.split('@', 2);
      if (splitted_domain.length === 2) {
        results['user'] = splitted_domain[0];
      }

      var splitted_resource = splitted_domain.pop().split('/', 2)
      if (splitted_resource.length === 2){
       results['resource'] = splitted_resource.pop();
      }

      results['domain'] = splitted_resource.pop();

    return results
    }
});
