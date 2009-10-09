if (typeof(tests) == 'undefined') { tests = {}; }


// some helpers
function mock_raw_connection(answers, request_checks) {
    // we turn it around so that the pop is easier
    answers.reverse();
    request_checks.reverse();
    MochiKit.MochiChi.RawConnection.prototype['send'] = 
      function(dom) {
        if (request_checks.length)
          request_checks.pop()(dom);
        return MochiKit.Async.succeed(answers.pop());
      };

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


// ACTUAL TESTS


tests.test_CreateBodyChangesRequestID = function (t) {

  var raw = new MochiKit.MochiChi.RawConnection('/whatever');

  var bodyA = raw.create_body({}, []);
  var bodyB = raw.create_body();
  var bodyC = raw.create_body({});

  // they all must be different
  ok(bodyA.getAttribute('rid') != bodyB.getAttribute('rid'));
  ok(bodyB.getAttribute('rid') != bodyC.getAttribute('rid'));
  ok(bodyA.getAttribute('rid') != bodyC.getAttribute('rid'));

}
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



