if (typeof(tests) == 'undefined') { tests = {}; }

tests.test_Parsing = function (t) {

  var base = "ben@localhost/office";
  var expected = { user: 'ben', domain: 'localhost', resource: 'office'};

  isDeeply(MochiKit.MochiChi.parse_jid(base), expected);

  var base = "ben@localhost";
  var expected = { user: 'ben', domain: 'localhost', resource: null};

  isDeeply(MochiKit.MochiChi.parse_jid(base), expected);

  var base = "ben@jabber.org/home";
  var expected = { user: 'ben', domain: 'jabber.org', resource: 'home'};

  isDeeply(MochiKit.MochiChi.parse_jid(base), expected);

  var base = "jabber.org/home";
  var expected = { user: null, domain: 'jabber.org', resource: 'home'};

  isDeeply(MochiKit.MochiChi.parse_jid(base), expected);

  var base = "jabber.org";
  var expected = { user: null, domain: 'jabber.org', resource: null};

  isDeeply(MochiKit.MochiChi.parse_jid(base), expected);
}

