
if (typeof(tests) == 'undefined') { tests = {}; }

tests.test_GetBody = function(t) {
  var my_body = MochiKit.DOM.createDOM('body');
  var response = {
      responseXML: {
        documentElement: my_body
      }
    }
  var got_body = MochiKit.MochiChi.get_body(response);
  is(got_body, my_body);

  // ok do it more precise
  var my_body = MochiKit.DOM.createDOM('body', {'id': 'gotcha'});
  var response = {
      responseXML: {
        documentElement: my_body
      }
    }
  var got_body = MochiKit.MochiChi.get_body(response);
  is(got_body, my_body);
  is(got_body.getAttribute('id'), 'gotcha');

  // now we don't have a body-element but something spooky
  var my_body = MochiKit.DOM.createDOM('spooky');
  var response = {
      responseXML: {
        documentElement: my_body
      }
    }

  try{
    var got_body = MochiKit.MochiChi.get_body(response);
    ok(false, "could spoof non-body element into it!");
  } catch(error) {
    is(error.name, 'NoBodyElementFound');
  }

  // now we directly pass a body element and want to have it back
  var new_body = MochiKit.DOM.createDOM('body');
  var got_body = MochiKit.MochiChi.get_body(new_body);
  is(new_body, got_body);

  // and what if we pass a wrong element again?
  var wrong = MochiKit.DOM.createDOM('wrong');
  try{
    var got_body = MochiKit.MochiChi.get_body(wrong);
    ok(false, "could spoof non-body element into it!");
  } catch(error) {
    is(error.name, 'NoBodyElementFound');
  }

  // but it also fails if there is a wrong response in it,
  // doesn't it?
  try{
    var got_body = MochiKit.MochiChi.get_body({});
    ok(false, "there was no response!!!");
  } catch(error) {
    is(error.name, 'NoBodyElementFound');
  }


}
