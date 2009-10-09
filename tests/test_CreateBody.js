if (typeof(tests) == 'undefined') { tests = {}; }

tests.test_CreateBody = function(t) {
  var bodyA = MochiKit.MochiChi.create_body({}, []);
  var bodyB = MochiKit.MochiChi.create_body();
  var bodyC = MochiKit.MochiChi.create_body({});

  // they all must be different
  ok(bodyA.getAttribute('rid') != bodyB.getAttribute('rid'));
  ok(bodyB.getAttribute('rid') != bodyC.getAttribute('rid'));
  ok(bodyA.getAttribute('rid') != bodyC.getAttribute('rid'));

}
