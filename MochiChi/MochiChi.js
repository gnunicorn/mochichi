/***

MochiKit.MochiChi 1.5

(c) 2009 Benjamin Kampmann.  All rights Reserved.

***/

MochiKit.Base._module('MochiChi', '1.5', ['Base', 'Async', 'Signal', 'DOM', 'Crypt', 'Logging', 'Iter']);

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
    this.stream_id = null;

    // should not be changed right now
    this.version = '1.6';
    this.wait = 60; // FIXME: make this dynamic by looking at the browser
    this.hold = 1; // this should not be changed ever
    this.currently_open = 0;

    // internal for error handling
    this.errors = 0;
  }

MochiKit.MochiChi.RawConnection.prototype =  {
    connect: function(server) {

      if (this.connected)
        throw "Connection already/still connected"

      var attrs = {
          'to' : server,
          'content': 'text/xml; charset=utf-8',
          'xml:lang': this.lang,
          'xmpp:version': '1.0',
          'ver': this.version,
          'wait': this.wait, // 3 is good for testing
          'hold': this.hold,
        }

      self = this;
      var start_session = function(response) {
          var body = MochiKit.MochiChi.get_body(response);
          self.session_id = body.getAttribute("sid");
          self.stream_id = body.getAttribute("authid");
          self.set_connected(true);

          // there must be children in the body, otherwise
          // we need to send another request and hope that
          // we got it by then

          if (!body.hasChildNodes()){
            return self.send(MochiKit.MochiChi.create_body({}));
            }
          return response;
        };
      var finalize_request = function(response){
          self._schedule_send()
          return response;
        }

      var dfr = this.send(MochiKit.MochiChi.create_body(attrs));
      dfr.addCallback(start_session)
      return dfr;
    },

    set_connected: function(value){
      MochiKit.Signal.signal(this, 'connected', value);
      this.connected = value;
    },

    request: function(request_dom){
        this.spool.push(request_dom);
        MochiKit.Async.callLater(0,
            MochiKit.Base.bind(this._schedule_send, this));
    },

    send: function(dom) {
      if (this.session_id) {
        dom.setAttribute('sid', this.session_id);
      }

      return MochiKit.Async.doXHR(this.url, {
              method : 'POST',
              sendContent: MochiKit.DOM.toHTML(dom)}
            );
      },

    simple_send: function(objects) {
      return this.send(MochiKit.MochiChi.create_body({}, objects));
    },
  
    _send_done: function(result) {
        if (this.errors >= 3) {
          this.set_connected(false);
          throw {name: 'ConnectionLost'};
        }
        this.currently_open --;
        this._schedule_send();
        return result
    },

    _got_error: function(error) {
      console.log("Got an error:" + error);
      this.errors ++;
    },

    _got_response: function(response) {
      this.erors = 0;
      var body = MochiKit.MochiChi.get_body(response);

      var self = this;
      function process_nodes() {
        var nodes = body.childNodes;
        for (var i=0; i < nodes.length; i++) {
          try {
            var child = nodes[i];
            MochiKit.Signal.signal(self, 'response', child);
          } catch(error) {
            MochiKit.Logging.warning(error);
          }
        }
      }

      // schedule childNode iteration for the next loop
      MochiKit.Async.callLater(0, process_nodes);

      if (body.getAttribute('type').toUpperCase() === 'TERMINATE') {
        // we got terminated
        console.log(body.getAttribute('condition'));
        this.set_connected(false);
      }

    },

    _schedule_send: function() {
      if (!this.connected ||
            (this.spool.length === 0 && this.currently_open >= this.hold)) {
        return
      }
      this.currently_open ++;
      var spooled = this.spool;
      this.spool = [];

      var dfr = this.simple_send(spooled);
      dfr.addCallbacks(
          // Callback
          MochiKit.Base.bind(this._got_response, this),
          // Errback
          MochiKit.Base.bind(this._got_error, this)
            )

      dfr.addBoth(MochiKit.Base.bind(this._send_done, this))
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

  }


/** @id MochiKit.MochiChi.Connection
 * 
 * signals:
 *      state - the current state the Connection is in
 *      unknown-iq - received an IQ without any known request. If expect some of
 *                   those IQs to come in (e.g. for roster-set) connect to this
 *                   signal and handled it please.
 *      unknown-message - didn't find any message handler for this message. If
 *                   you expect these kind of messages to come in and want to
 *                   handle them connect to this signal.

 * */
MochiKit.MochiChi.Connection = function(service_url) {
    this.jid = null;
    this.password = null;

    this.connection = new MochiKit.MochiChi.RawConnection(service_url);

    // for presence management
    this.presence = new MochiKit.MochiChi.Presence(this);

    // For IQ management
    this.iq_deferreds = {};

    // message management is fun
    this.msg_handlers = [];

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
      if (this.connection.connected) {
        throw {name: "UnsupportedError", message:"already connected"}
      }

      dfr = this.connection.connect(this.server);
      MochiKit.Signal.connect(this.connection, 'response',
                MochiKit.Base.bind(this._handle_response, this))

      dfr.addCallback(MochiKit.Base.bind(this._login, this));
      return dfr
  },

  send_iq: function(attrs, nodes) {
    var defaults = {
      'from' : this.jid
    }

    MochiKit.Base.update(attrs, defaults);

    var iq = MochiKit.MochiChi.create_iq(attrs, nodes);
    var dfr = new MochiKit.Async.Deferred();
    this.iq_deferreds[iq.getAttribute('id')] = dfr;
    this.send(iq);
    return dfr
  },

  send: function(DOM) {
    return this.connection.request(DOM);
  },

  _handle_response: function(DOM){
    MochiKit.Logging.log("got " + DOM.nodeName)
    this['_handle_' + DOM.nodeName.toLowerCase() + '_response'](DOM);
  },
  
  _handle_iq_response: function(DOM) {
    MochiKit.Logging.log("iq " + DOM);
    var id = DOM.getAttribute('id');
    dfr = this.iq_deferreds[id];
    delete this.iq_deferreds[id];
    if (!dfr) {
      MochiKit.Signal.signal(this, 'unknown-iq', DOM);
    }
    
    var typ = DOM.getAttribute('type');
    if (typ.toUpperCase() === "RESULT"){
      return dfr.callback(DOM);
    }
    return dfr.errback(DOM);
  },

  _handle_message_response: function(DOM) {
    MochiKit.Logging.warning("message " + DOM);
    MochiKit.Signal.signal(this, 'unknown-message', DOM);
  },

  _handle_presence_response: function(DOM) {
    MochiKit.Logging.warning("presence " + DOM);
  },

  _features_done: function(iq_response) {
    var jid = MochiKit.MochiChi.get_child(
        MochiKit.MochiChi.get_child(iq_response, 'bind'), 'jid');
    this.jid = jid.firstChild.nodeValue;
    console.log("received new jid: " + this.jid);


    // now initiate the session officially
    var dfr = this.send_iq({type: 'set'}, [
        MochiKit.DOM.createDOM('session',
            {'xmlns': MochiKit.MochiChi.NS.session}, [])
        ]);
    // dfr.addCallback(MochiKit.Base.bind(this._features_done, this));
    return dfr
  },

  _feature_setup: function (response) {
    var features = MochiKit.MochiChi.get_child(
        MochiKit.MochiChi.get_body(response), 'stream:features');

    var bind = MochiKit.MochiChi.get_child(features, 'bind');
    //var session = MochiKit.MochiChi.get_child(features, 'session');

    var dfr = this.send_iq({type: 'set'}, [
        MochiKit.DOM.createDOM('bind', {'xmlns': MochiKit.MochiChi.NS.bind}, [
            MochiKit.DOM.createDOM('resource', {}, [this.resource])
          ])
        ]);
    dfr.addCallback(MochiKit.Base.bind(this._features_done, this));
    return dfr
  },

  _got_auth: function(response) {
    MochiKit.Logging.log(response);
    var body = MochiKit.MochiChi.get_body(response);
    try {
      var child = MochiKit.MochiChi.get_child(body, 'success');
    } catch (err) {
        throw {name: "LoginError", message: err};
    }

    // YAY. we are logged in
    console.log("we are done");
    // re-request the stream
    var restart = MochiKit.MochiChi.create_body(
        {"xmpp:restart":"true",
         "to": this.server
        });
    var dfr = this.connection.send(restart);
    dfr.addCallback(MochiKit.Base.bind(this._feature_setup, this));
    return dfr;

  },

  _login: function (response) {
    // do actually something here
    // time to request the stream
    // var authid = body.getAttribute('authid');

    var body = MochiKit.MochiChi.get_body(response);

    var plain_allowed = false;
    var digest_md5_allowed = false;
    var anonymous_allowed = false;

    // FIXME: using MochiKit.Iter.forEach would be nicer
    var mechanisms = body.getElementsByTagName("mechanism");
    for (var i = 0; i < mechanisms.length; i++) {
        var mech = mechanisms[i].firstChild.nodeValue;
        if (mech == 'DIGEST-MD5') {
            digest_md5_allowed = true;
        } else if (mech == 'PLAIN') {
            plain_allowed = true;
        } else if (mech == 'ANONYMOUS') {
            anonymous_allowed = true;
        }
      }

    if (!this.username){
      if (!anonymous_allowed) {
        throw {name: "LoginError", message: "Anonymous login forbidden"};
      }
      var request = MochiKit.DOM.createDOM('auth', {
                xmlns: MochiKit.MochiChi.NS.sasl,
                mechanism: "ANONYMOUS"});
      var dfr = this.connection.simple_send([request]);
      dfr.addCallback(MochiKit.Base.bind(this._got_auth, this));
      return dfr

    } else if (digest_md5_allowed) {
      var request = MochiKit.DOM.createDOM('auth', {
                xmlns: MochiKit.MochiChi.NS.sasl,
                mechanism: "DIGEST-MD5"});
      var dfr = this.connection.simple_send([request]);
      dfr.addCallback(MochiKit.Base.bind(this._md5_challenge, this));
      dfr.addCallback(MochiKit.Base.bind(this._got_auth, this));
      return dfr

    } else if (plain_allowed) {
      throw {name: "NotImplemented", message: "plain text isn't implemented yet"};

    } else {
      throw {name: "LoginError", message: "Unsupported Login Mechanism"};
    }

  },

  _md5_challenge: function(response) {
    var challenge = MochiKit.MochiChi.get_child(
        MochiKit.MochiChi.get_body(response), 'challenge');

    var key = challenge.firstChild.nodeValue;
    MochiKit.Logging.log(key);

    var challenge = MochiKit.Crypt.decode64(key);
    var incoming = {
      realm: "",
      host: null,
      nonce: null,
      qop: null
      }

    MochiKit.Logging.log(challenge);
    var splitted = challenge.split(',');
    for (var i=0; i < splitted.length; i ++) {
      var two_parts = splitted[i].split('=',2);
      var key = two_parts[0];
      var value = two_parts[1];
      if (value[0] === '"'){
        // surrounded by " remove them
        value = value.slice(1, value.length-1);
      }
      incoming[key] = value;
      MochiKit.Logging.log(key + "=" + value);
    }

    var cnonce = MochiKit.Crypt.hex_md5(Math.random() * 1234567890);

    var digest_uri = "xmpp/" + this.server;
    if (incoming['host'] !== null) {
        digest_uri = digest_uri + "/" + host;
    }

    MochiKit.Logging.log(this.username);
    MochiKit.Logging.log(this.password);
    var A1 = MochiKit.Crypt.str_md5(this.username + ":" +
            incoming.realm + ":" + this.password) +
        ":" + incoming.nonce + ":" + cnonce;
    var A2 = 'AUTHENTICATE:' + digest_uri;

    MochiKit.Logging.log(A1);
    MochiKit.Logging.log(A2);

    var quote = MochiKit.MochiChi.quote

    var responseText = 'username=' + quote(this.username) + 
      ',realm=' + quote(incoming.realm) + ',nonce=' +
      quote(incoming.nonce) + ',cnonce=' +
      quote(cnonce) + ',nc=00000001,qop=auth,digest-uri=' + 
      quote(digest_uri) + ',response=' + quote(
          MochiKit.Crypt.hex_md5(MochiKit.Crypt.hex_md5(A1) + ":" +
              incoming.nonce + ":00000001:" + cnonce + ":auth:" +
              MochiKit.Crypt.hex_md5(A2))
        ) + ',charset="utf-8"';

    MochiKit.Logging.log(responseText);
    var response = MochiKit.DOM.createDOM('response', {
                xmlns: MochiKit.MochiChi.NS.sasl,
            }, [MochiKit.Crypt.encode64(responseText)]);

    var dfr = this.connection.simple_send([response]);

    var self = this;
    function got_rsp(response){
      var challenge = MochiKit.MochiChi.get_child(
          MochiKit.MochiChi.get_body(response), 'challenge');

      var resp = MochiKit.DOM.createDOM('response', {
                xmlns: MochiKit.MochiChi.NS.sasl,
            });

      return self.connection.simple_send([resp]);
    }

    dfr.addCallback(got_rsp)
    return dfr

  },

  /*
  auto_discover: function(entity) {
    // discover every and all the subs
    var self = this;
    function discover_more(disco) {
      var reqs = [];
      var discovered = disco.discovered = [];
      MochiKit.Iter.forEach(disco.items, function(jid) {
        var dfr = self.auto_discover(jid);
        dfr.addCallback(discovered.push);
        reqs.push(dfr);
      });
      return MochiKit.Async.DeferredList(reqs);
    }
    
    var dfr = this.discover(entity)
    dfr.addCallback(discover_more);
    return dfr
  },

  discover: function(entity) {
    if (!entity){
      entity = this.server;
    }

    var disco = new MochiKit.MochiChi.Disco(this, entity);
    dfr = disco.discover_items();
    dfr.addCallback(MochiKit.Base.partial(MochiKit.Base.bind(
        disco.discover_info, disco)));
    dfr.addCallback(function() { return disco });
    return dfr
  },
  */
  disconnect: function() {
    
  }

}

/*
 * Presence system. Allows you to manage presence settings and subscriptions
 */

MochiKit.MochiChi.Presence = function (connection) {
  this.connection = connection;
}

MochiKit.MochiChi.Presence.prototype = {
  send_status: function(stat_type, msg) {
    var children = [
      MochiKit.DOM.createDOM('show', {}, [stat_type])
    ];

    if (msg) {
      children.push(MochiKit.DOM.createDOM('status', {}, [msg]));
    }

    var presence = MochiKit.DOM.createDOM('presence', {}, children);
    return this.connection.send(presence);
  },
  available: function() {
    var presence = MochiKit.DOM.createDOM('presence', {}, []);
    return this.connection.send(presence);
  },
  // convinience functions
  chat: function(msg){
    return this.send_status('chat', msg);
  },
  away: function(msg){
    return this.send_status('away', msg);
  },
  xa: function(msg){
    return this.send_status('xa', msg);
  },
  dnd: function(msg){
    return this.send_status('dnd', msg);
  }

}

/*
 *  Discovery Features encapsulated.
 * */
MochiKit.MochiChi.Disco = function(connection, entity) {
  this.connection = connection;
  this.entity = entity;

  this.items = [];
  this.features = [];
}

MochiKit.MochiChi.Disco.prototype = {
  
  discover_items: function() {
    this.items = [];
    var dfr = this.connection.send_iq({type: 'get', to: this.entity}, [
        MochiKit.DOM.createDOM('query',
          { xmlns: MochiKit.MochiChi.NS.disco_items }, []
        )]
      );
    dfr.addCallback(MochiKit.Base.bind(this._parse_items, this));
    return dfr;
  },
  discover_info: function() {
    this.features = [];
    var dfr = this.connection.send_iq({type: 'get', to: this.entity}, [
        MochiKit.DOM.createDOM('query',
          { xmlns: MochiKit.MochiChi.NS.disco_info }, []
        )]
      );
    dfr.addCallback(MochiKit.Base.bind(this._parse_info, this));
    return dfr;
  },

  // internals
  _parse_info: function(iq) {
    var query = MochiKit.MochiChi.get_child(iq, 'query');
    var that = this;
    MochiKit.Iter.forEach(query.getElementsByTagName('feature'),
      function(item) {
        that.features.push(item.getAttribute('var'));
      });
    console.log("features parsed: " + this.features);
    return this.features;
  },

  _parse_items: function(iq) {
    var query = MochiKit.MochiChi.get_child(iq, 'query');
    var that = this;
    MochiKit.Iter.forEach(query.getElementsByTagName('item'),
      function(item) {
        var jid = item.getAttribute('jid');
        if (!jid || jid === that.entity){
          return;
        }
        that.items.push(jid);
      });
    console.log(this.items);
    return this.items;
  }
}

MochiKit.MochiChi.Entity = function(connection, jid) {
  this.connection = connection;
  this.jid = jid;
  this.discoverer = new MochiKit.MochiChi.Disco(this.connection, this.jid);
  this.identities = [];
  this.features = [];
}

MochiKit.MochiChi.Entity.prototype = {
  auto_discover: function (/* optional */ features) {
    if (!features) {
      var features = MochiKit.MochiChi.ENTITY_FEATURES;
    }

    var self = this;
    function load_results(results) {
      var dfrs = [];
      MochiKit.Iter.forEach(features, function(cur_feature) {
          if (cur_feature.matches(results)) {
            dfrs.push(self.add_feature(cur_feature));
          } else {
            console.log("Not loaded " + cur_feature);
          }
        });

      return MochiKit.Async.gatherResults(dfrs);
    }

    var dfr = this.discoverer.discover_info();
    dfr.addCallback(load_results);
    return dfr

  },

  add_feature: function(feature) {
    dfr = MochiKit.Async.maybeDeferred(feature.set_up, this);
    dfr.addCallback(this.features.push);
    return dfr
  }
}

MochiKit.Base.update(MochiKit.MochiChi, {
    // Namespace we support/know of:
    NS: {
      httpbind: 'http://jabber.org/protocol/httpbind',
      bind: 'urn:ietf:params:xml:ns:xmpp-bind',
      client: 'jabber:client',
      sasl: "urn:ietf:params:xml:ns:xmpp-sasl",
      session: 'urn:ietf:params:xml:ns:xmpp-session',

      // DISCO
      disco_info: 'http://jabber.org/protocol/disco#info',
      disco_items: 'http://jabber.org/protocol/disco#items'
    },

    ENTITY_FEATURES: [
      // 
    ],

    get_body: function(response) {
      var body = null;
      try {
        body = response.responseXML.documentElement;
      } catch(err) {
        body = response;
      }

      if (!body || !body.nodeName || body.nodeName.toUpperCase() !== 'BODY')
        throw {name: "NoBodyElementFound"};

      return body;
    },

    get_child: function(daddy, child_name) {
      var child = daddy.firstChild;
      if (!child){
        throw {name: 'ParseError', message:'No Child found for ' + daddy}
      }
      if (!child.nodeName || 
            child.nodeName.toUpperCase() != child_name.toUpperCase()){
        throw {name: 'ParseError',
            message: daddy + ' has unexpected child. Found ' +
                     child.NodeName + ' instead of ' + child_name}
      }
      return child;
    },

    create_body: function(attrs, nodes) {
      var defaults = {
          xmlns: MochiKit.MochiChi.NS.httpbind,
   //       "xmlns:xmpp": "urn:xmpp:xbosh",
          rid: MochiKit.MochiChi._nextRequestId(),
        }

    MochiKit.Base.update(attrs, defaults)

    return MochiKit.DOM.createDOM('body', attrs, nodes);
    },

    create_iq: function(attrs, nodes) {
      var defaults = {
          xmlns: MochiKit.MochiChi.NS.client,
          id: MochiKit.MochiChi._nextIQId()
        }

    MochiKit.Base.update(attrs, defaults)

    return MochiKit.DOM.createDOM('iq', attrs, nodes);
    },


    // FIXME: add tests for quoting
    quote: function (before)
    {
        return '"' + before.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
    },

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
    },
    _nextRequestId: MochiKit.Base.counter(Math.ceil(Math.random() * 10203)),
    _nextIQId: MochiKit.Base.counter(Math.ceil(Math.random() * 20403))
});
