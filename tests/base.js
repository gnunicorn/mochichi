function runTest(test_script) {
	try {
			SimpleTest.saveScope(this);
			test_script({ok:SimpleTest.ok,is:SimpleTest.is});
			SimpleTest.verifyScope(this);
			SimpleTest.ok( true, "test suite finished!");
	} catch (err) {
			var s = "test suite failure!\n";
			var o = {};
			var k = null;
			for (k in err) {
					// ensure unique keys?!
					if (!o[k]) {
							s +=  k + ": " + err[k] + "\n";
							o[k] = err[k];
					}
			}
			SimpleTest.ok ( false, s );
	}
}

function runMultipleTests(tests) {
  for (var i=0; i < tests.length; i++) {
    runTest(tests[i]);
  }
}
