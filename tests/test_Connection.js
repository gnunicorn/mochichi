if (typeof(tests) == 'undefined') { tests = {}; }


// some helpers
function mock_raw_connection(answers, request_checks) {
    // we turn it around so that the pop is easier
    var sent = []
    answers.reverse();
    request_checks.reverse();
    MochiKit.MochiChi.RawConnection.prototype['send'] = 
      function(dom) {
        sent.push(dom);
        if (request_checks.length)
          request_checks.pop()(dom);
        return MochiKit.Async.succeed(answers.pop());
      };

    MochiKit.MochiChi.RawConnection.prototype['__sent'] =  sent;
  };

function check_first_body(body) {
  is(body.getAttribute('sid'), null);
  is(body.getAttribute('xmpp:version'), '1.0');
  is(body.getAttribute('to'), 'pocahontas.disney.com');
  is(body.getAttribute('content'), 'text/xml; charset=utf-8');
}

function create_response(attrs, nodes){
  var response = {
      responseXML: {
        documentElement: MochiKit.DOM.createDOM('body', attrs, nodes)
      }
    };
  return response
}

function check_response_string(incoming, reference){
    var splitted = incoming.split(',');
    var left_over = {};
    for (var i=0; i < splitted.length; i ++) {
      var two_parts = splitted[i].split('=',2);
      var key = two_parts[0];
      var value = two_parts[1];
      if (value[0] === '"'){
        // surrounded by " remove them
        value = value.slice(1, value.length-1);
      }
      if (typeof(reference[key]) === 'undefined'){
        left_over[key] = value;
      } else {
        is(reference[key], value);
        delete reference[key];
      }
    }

    // check also whether all have been found
    is([x for (x in reference)].length, 0);
    return left_over;
  }

function create_login_response(mechanisms) {
    if (!mechanisms)
      mechanisms = ['DIGEST-MD5', 'PLAIN', 'ANONYMOUS'];

    var children = []
    for (var i=0; i < mechanisms.length; i++)
      children.push(MochiKit.DOM.createDOM('Mechanism', {}, [mechanisms[i]]));

    return create_response( {
        'sid' : 'pocahontas',
        'authid' : 'test'}, [
            MochiKit.DOM.createDOM('STREAM:STREAM', {}, children)
            ]
          );
}

// ACTUAL TESTS

tests.test_SimpleRawConnect = function (t) {
  var answers = [
    create_response( {
          'sid' : 'pocahontas',
          'authid' : 'test'}, [ MochiKit.DOM.createDOM('STREAM:STREAM')])
        ];
  mock_raw_connection(answers, [check_first_body]);

  // actual tests start here
  var raw = new MochiKit.MochiChi.RawConnection('/whatever');

  is(raw.connected, false);
  // do a connect
  var dfr = raw.connect('pocahontas.disney.com');

  // check whether the connection read the correct information
  is(raw.connected, true);
  is(raw.session_id, 'pocahontas');
  is(raw.stream_id, 'test');

  function got_response(response) {
    var body = response.responseXML.documentElement;
    is(body.firstChild.nodeName, 'STREAM:STREAM');
  }

  dfr.addCallback(got_response);

  return dfr
}

tests.test_SimpleRawConnectStreamMissing = function (t) {
  var answers = [
    create_response( {
          'sid' : 'pocahontas',
          'authid' : 'test'},
          []),
    // first one does not contain the necessary STREAM-Element.
    // connection has to do another request and send that one
    create_response( {
          'sid' : 'pocahontas'},
          [ MochiKit.DOM.createDOM('stream:stream')])
        ];
  mock_raw_connection(answers, [check_first_body]);


  // actual tests start here
  var raw = new MochiKit.MochiChi.RawConnection('/whatever');

  is(raw.connected, false);

  // do a connect
  var dfr = raw.connect('pocahontas.disney.com');

  // check whether the connection read the correct information
  is(raw.connected, true);
  is(raw.session_id, 'pocahontas');
  is(raw.stream_id, 'test');

  function got_response(response) {
    var body = response.responseXML.documentElement;
    is(body.firstChild.nodeName, 'STREAM:STREAM');
  }

  dfr.addCallback(got_response);

  return dfr
}

tests.test_ConnectionLoginNoUser = function(t)  {
  mock_raw_connection([], []);
  var Connection = new MochiKit.MochiChi.Connection('/service');
  ok(!Connection.username);
  Connection._login(create_login_response());

  is(Connection.connection.__sent.length, 1);

  var body = Connection.connection.__sent.pop();
  var auth = body.firstChild;
  is(auth.nodeName, 'AUTH');
  // FIXME: add real name spacing helpers
  //is(auth.getAttribute('xmlns'), '');
  is(auth.getAttribute('mechanism'), 'ANONYMOUS');

}

tests.test_ConnectionLoginNoUserNoAnonymous = function(t)  {
  mock_raw_connection([], []);
  var Connection = new MochiKit.MochiChi.Connection('/service');
  ok(!Connection.username);
  try{
    Connection._login(create_login_response(['PLAIN']));
    ok(false, "Login should fail");
  } catch (error){
    is(error.name, 'LoginError');
    ok(true, "login failed");
  }
}

tests.test_ConnectionLoginMD5Preferred = function(t)  {
  mock_raw_connection([], []);
  var Connection = new MochiKit.MochiChi.Connection('/service');
  ok(!Connection.username);
  Connection.username = "test";
  Connection._login(create_login_response());

  is(Connection.connection.__sent.length, 1);

  var body = Connection.connection.__sent.pop();
  var auth = body.firstChild;
  is(auth.nodeName, 'AUTH');
  // FIXME: add real name spacing helpers
  //is(auth.getAttribute('xmlns'), '');
  is(auth.getAttribute('mechanism'), 'DIGEST-MD5');
}

tests.test_ConnectionLoginMD5 = function(t) {
  mock_raw_connection([], []);
  var Connection = new MochiKit.MochiChi.Connection('/service');
  ok(!Connection.username);
  Connection.username = 'my_user';
  Connection.server = 'jabber.com';
  Connection.password = 'test_password';

  var key = MochiKit.Crypt.encode64('nonce="3488040084",qop="auth",charset=utf-8,algorithm=md5-sess');
  var response = create_response({},
        [MochiKit.DOM.createDOM('challenge', {}, [key])]
      );
  console.log(response)
  var dfr = Connection._md5_challenge(response);

  is(Connection.connection.__sent.length, 1);

  var body = Connection.connection.__sent.pop();
  var auth = body.firstChild;
  is(auth.nodeName, 'RESPONSE');
  // FIXME: add real name spacing helpers
  //is(auth.getAttribute('xmlns'), '');
  var result_key = auth.firstChild.nodeValue;
  var decoded = MochiKit.Crypt.decode64(result_key);
  console.log(decoded);
  var results = check_response_string(decoded,
      {'username' : 'my_user',
       'realm': '',
       'nonce': "3488040084",
       'qop': "auth",
       'charset': "utf-8",
       'digest-uri': 'xmpp/jabber.com'
      });
  var cnonce = results['cnonce'];
  var response = results['response'];
  console.log(cnonce);
  var expected_one = MochiKit.Crypt.str_md5("my_user::test_password") +  ":3488040084:"+ cnonce;
  is(response, MochiKit.Crypt.hex_md5(MochiKit.Crypt.hex_md5(expected_one) +
              ":3488040084:00000001:" + cnonce + ":auth:" +
              MochiKit.Crypt.hex_md5('AUTHENTICATE:xmpp/jabber.com')));
}
tests.test_ConnectionLoginMD5BetterTwice = function(t) {
  mock_raw_connection([], []);
  var Connection = new MochiKit.MochiChi.Connection('/service');
  ok(!Connection.username);
  Connection.username = 'other_user';
  Connection.server = 'jabber.org';
  Connection.password = 'good_password';

  var key = MochiKit.Crypt.encode64('nonce=abcd1234,qop=auth,charset="utf-8",algorithm="md5-sess",realm="your father"');
  var response = create_response({},
        [MochiKit.DOM.createDOM('challenge', {}, [key])]
      );
  console.log(response)
  var dfr = Connection._md5_challenge(response);

  is(Connection.connection.__sent.length, 1);

  var body = Connection.connection.__sent.pop();
  var auth = body.firstChild;
  is(auth.nodeName, 'RESPONSE');
  // FIXME: add real name spacing helpers
  //is(auth.getAttribute('xmlns'), '');
  var result_key = auth.firstChild.nodeValue;
  var decoded = MochiKit.Crypt.decode64(result_key);
  console.log(decoded);
  var results = check_response_string(decoded,
      {'username' : 'other_user',
       'realm': 'your father',
       'nonce': "abcd1234",
       'qop': "auth",
       'charset': "utf-8",
       'digest-uri': 'xmpp/jabber.org'
      });
  var cnonce = results['cnonce'];
  var response = results['response'];
  console.log(cnonce);
  var expected_one = MochiKit.Crypt.str_md5("other_user:your father:good_password") +  ":abcd1234:"+ cnonce;
  is(response, MochiKit.Crypt.hex_md5(MochiKit.Crypt.hex_md5(expected_one) +
              ":abcd1234:00000001:" + cnonce + ":auth:" +
              MochiKit.Crypt.hex_md5('AUTHENTICATE:xmpp/jabber.org')));

}
