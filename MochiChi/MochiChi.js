/***

MochiKit.MochiChi 1.5

(c) 2009 Benjamin Kampmann.  All rights Reserved.

***/

MochiKit.Base._module('MochiChi', '1.5', ['Base', 'Async', 'Signal', 'DOM']);

/** @id MochiKit.MochiChi.Connection
 * 
 * signals:
 *      state - the current state the Connection is in
 *      response
 * */
MochiKit.MochiChi.RawConnection = function (url) {
    this.connected = false;
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
    this.currently_open = 0;

  }

MochiKit.MochiChi.RawConnection.prototype =  {
    connect: function(server) {

      if (this.connected)
        throw "Connection already/still connected"

      attrs = {
          'to' : server,
          'content': 'text/xml; charset=utf-8',
          'xml:lang': this.lang,
          'ver': this.version,
          'wait': this.wait, // 3 is good for testing
          'hold': this.hold,
        }

      self = this;
      var start_session = function(response) {
          var body = response.responseXML.documentElement;
          self.session_id = body.getAttribute("sid");
          self.set_connected(true);

          self._schedule_send();
        };

      dfr = this.send(this.create_body(attrs));
      dfr.addCallback(start_session)

      return dfr;
    },

    set_connected: function(value){
      MochiKit.Signal.signal(this, 'connected', value);
      this.connected = value;
    },

    /*send: function(data) {
      this.spool.push(data);
      this._schedule_send();
    },
    */
    send: function(dom) {
      return MochiKit.Async.doXHR(this.url, {
              method : 'POST',
              sendContent: MochiKit.DOM.toHTML(dom)}
            );
      },

    create_body: function(attrs, nodes) {
      defaults = {
          xmlns: 'http://jabber.org/protocol/httpbind',
          rid: this._nextRequestId(),
        }

      if (this.session_id) {
        defaults['sid'] = this.session_id;
      }

      MochiKit.Base.update(attrs, defaults)

    return MochiKit.DOM.createDOM('body', attrs, nodes);
    },
  
    _send_done: function(result) {
        this.currently_open --;
        this._schedule_send();
        return result
    },

    _got_response: function(response) {
      body = response.responseXML.documentElement;
      for (child in body.ChildNodes) {
        try {
          MochiKit.Signal.signal(this, 'response', child);
        } catch(error) {
          console.log(error);
        }
      }
    },

    _schedule_send: function() {
      if (this.currently_open > this.hold){
        return
      }
      this.currently_open ++;
      var spooled = this.spool;
      var body = this.create_body({}, spooled);
      this.spool = [];

      dfr = this.send(body);
      dfr.addBoth(MochiKit.Base.bind(this._send_done, this))
      dfr.addCallback(MochiKit.Base.bind(this._got_response, this))
      return dfr
    },

    repr: function () {
        return 'Connection(' + this.id + ', ' + this.connected + ')';
    },

    disconnect: function () {
      // close any still open connections
      // clean up still open requests  
    },


    toString: MochiKit.Base.forwardCall("repr"),
    _nextId: MochiKit.Base.counter(),
    _nextRequestId: MochiKit.Base.counter(12345)

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
    MochiKit.Signal.connect(this.connection, 'connected', console.log);
  }

MochiKit.MochiChi.Connection.prototype = {
    connect: function (jid, password) {

      this.jid = jid;
      this.password = password;
      var parsed = MochiKit.MochiChi.parse_jid(jid);
      this.server = parsed['domain'];
      this.username = parsed['user'];
      this.resource = parsed['resource'] ? parsed['resource'] : 'MochiChi';

      var dfr = null;
      if (!this.connection.connected) {
        dfr = this.connection.connect(this.server);
        MochiKit.Signal.connect(this.connection, 'response',
            MochiKit.Base.bind(this._handle_response, this))
      } else {
        dfr = MochiKit.Async.succeed('done');
      }
      dfr.addCallback(this._login);
      return dfr
  },

  _handle_response: function(DOM){
    console.log("got" + DOM)
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
