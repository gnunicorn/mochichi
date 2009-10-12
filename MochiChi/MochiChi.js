/***

MochiKit.MochiChi 1.5

(c) 2009 Benjamin Kampmann.  All rights Reserved.

***/

MochiKit.Base._module('MochiChi', '1.5', ['Base', 'Async', 'Signal', 'DOM', 'Crypt']);

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
      //dfr.addCallback(finalize_request)

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
    /*send: function(data) {
      this.spool.push(data);
      this._schedule_send();
    },
    */
    send: function(dom) {
      if (this.session_id) {
        dom.setAttribute('sid', this.session_id);
      }

      return MochiKit.Async.doXHR(this.url, {
              method : 'POST',
              sendContent: MochiKit.DOM.toHTML(dom)}
            );
      },
  
    _send_done: function(result) {
        this.currently_open --;
        this._schedule_send();
        return result
    },

    _got_response: function(response) {
        var body = MochiKit.MochiChi.get_body(response);
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
      var body = MochiKit.MochiChi.create_body({}, spooled);
      this.spool = [];

      var dfr = this.send(body);
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
      dfr.addCallback(MochiKit.Base.bind(this._login, this));
      dfr.addCallback(MochiKit.Base.bind(this.connection._schedule_send, this.connection));
      return dfr
  },

  _handle_response: function(DOM){
    console.log("got" + DOM)
  },

  _got_auth: function(response) {
    console.log(response);
    var body = MochiKit.MochiChi.get_body(response);
    var child = body.firstChild;
    if (!child){
      throw "Incomplete answer from the server. Suckage :( !"
    }
    if (child.nodeName === "success"){
        // YAY. we are logged in
        return true
    }

    throw {name: "LoginError", message: child.nodeName};

  },

  _login: function (response) {
    // do actually something here
    // time to request the stream
    // var authid = body.getAttribute('authid');

    var body = MochiKit.MochiChi.get_body(response);

    var plain_allowed = false;
    var digest_md5_allowed = false;
    var anonymous_allowed = false;

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
      var dfr = this.connection.send(MochiKit.MochiChi.create_body({}, [request]));
      dfr.addCallback(MochiKit.Base.bind(this._got_auth, this));
      return dfr

    } else if (digest_md5_allowed) {
      var request = MochiKit.DOM.createDOM('auth', {
                xmlns: MochiKit.MochiChi.NS.sasl,
                mechanism: "DIGEST-MD5"});
      var dfr = this.connection.send(MochiKit.MochiChi.create_body({}, [request]));
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
    var body = MochiKit.MochiChi.get_body(response);
    var challenge = body.firstChild;
    console.log(challenge);
    if (challenge.nodeName.toUpperCase() !== "CHALLENGE") {
      throw {name: "ERROR", message: challenge.nodeName};
    }
    var key = challenge.firstChild.nodeValue;
    console.log(key);

    //return response;

    var challenge = MochiKit.Crypt.decode64(key);
    var incoming = {
      realm: "",
      host: null,
      nonce: null,
      qop: null
      }

    console.log(challenge);
    splitted = challenge.split(',');
    for (var i=0; i < splitted.length; i ++) {
      var two_parts = splitted[i].split('=',2);
      var key = two_parts[0];
      var value = two_parts[1];
      if (value[0] === '"'){
        // surrounded by " remove them
        value = value.slice(1, value.length-1);
      }
      incoming[key] = value;
      console.log(key + "=" + value);
    }

    var cnonce = MochiKit.Crypt.hex_md5(Math.random() * 1234567890);

    var digest_uri = "xmpp/" + this.server;
    if (incoming['host'] !== null) {
        digest_uri = digest_uri + "/" + host;
    }

    console.log(this.username);
    console.log(this.password);
    var A1 = MochiKit.Crypt.str_md5(this.username + ":" +
            incoming.realm + ":" + this.password) +
        ":" + incoming.nonce + ":" + cnonce;
    var A2 = 'AUTHENTICATE:' + digest_uri;

    console.log(A1);
    console.log(A2);

    quote = MochiKit.MochiChi.quote

    var responseText = 'username=' + quote(this.username) + 
      ',realm=' + quote(incoming.realm) + ',nonce=' +
      quote(incoming.nonce) + ',cnonce=' +
      quote(cnonce) + ',nc=00000001,qop=auth,digest-uri=' + 
      quote(digest_uri) + ',response=' + quote(
          MochiKit.Crypt.hex_md5(MochiKit.Crypt.hex_md5(A1) + ":" +
              incoming.nonce + ":00000001:" + cnonce + ":auth:" +
              MochiKit.Crypt.hex_md5(A2))
        ) + ',charset="utf-8"';

    console.log(responseText);
    var response = MochiKit.DOM.createDOM('response', {
                xmlns: MochiKit.MochiChi.NS.sasl,
            }, [MochiKit.Crypt.encode64(responseText)]);

    var dfr = this.connection.send(MochiKit.MochiChi.create_body({}, [response]));

    var self = this;
    function got_rsp(response){
      var body = MochiKit.MochiChi.get_body(response);
      var challenge = body.firstChild;
      if (!challenge || challenge.nodeName.toUpperCase() !== 'CHALLENGE') {
        throw {name: "LoginFailed", message: challenge};
      }
      var resp = MochiKit.DOM.createDOM('response', {
                xmlns: MochiKit.MochiChi.NS.sasl,
            });
      return self.connection.send(MochiKit.MochiChi.create_body({}, [resp]));
    }

    dfr.addCallback(got_rsp)
    return dfr

  },

  disconnect: function() {
    
  }

}

MochiKit.Base.update(MochiKit.MochiChi, {
    // Namespace we support/know of:
    NS: {
      httpbind: 'http://jabber.org/protocol/httpbind',
      sasl: "urn:ietf:params:xml:ns:xmpp-sasl"
    },
    get_body: function(response) {
      var body = null;
      try {
        body = response.responseXML.documentElement;
      } catch(err) {
        body = response;
      }

      if (!body.nodeName || body.nodeName.toUpperCase() !== 'BODY')
        throw {name: "NoBodyElementFound"};

      return body;
    },

    create_body: function(attrs, nodes) {
      var defaults = {
          xmlns: MochiKit.MochiChi.NS.httpbind,
          rid: MochiKit.MochiChi._nextRequestId(),
        }

    MochiKit.Base.update(attrs, defaults)

    return MochiKit.DOM.createDOM('body', attrs, nodes);
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
    _nextRequestId: MochiKit.Base.counter(Math.ceil(Math.random() * 10203))
});
